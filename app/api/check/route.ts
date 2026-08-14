import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/currentUser";
import { prisma } from "@/lib/prisma";
import { checkWithLanguageTool, mapIssueTypeToCategory } from "@/lib/languagetool";
import { enrichErrors } from "@/lib/gemini";
import {
  computeCleanSessionBonus,
  computeStreakUpdate,
  evaluateNewBadges,
} from "@/lib/scoring";
import type { DraftError } from "@/lib/types";

const MAX_TEXT_LENGTH = 4000;

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export async function POST(request: Request) {
  const userId = await getCurrentUserId();

  const body = await request.json().catch(() => null);
  const text: unknown = body?.text;
  const businessMode: boolean = Boolean(body?.businessMode);

  if (typeof text !== "string" || text.trim().length === 0) {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }
  if (text.length > MAX_TEXT_LENGTH) {
    return NextResponse.json(
      { error: `text must be ${MAX_TEXT_LENGTH} characters or fewer` },
      { status: 400 }
    );
  }

  try {
  const t0 = Date.now();
  const matches = await checkWithLanguageTool(text);
  const t1 = Date.now();

  const draftErrors: DraftError[] = matches.map((match) => ({
    offset: match.offset,
    length: match.length,
    originalSpan: text.slice(match.offset, match.offset + match.length),
    suggestedReplacement: match.replacements[0]?.value ?? "",
    category: mapIssueTypeToCategory(match),
    ruleId: match.rule.id,
  }));

  // Gemini enrichment (translation/explanations/pronunciation/business tone)
  // is a best-effort add-on. If it fails (e.g. transient 503 overload), we
  // still want to show the LanguageTool-detected errors rather than losing
  // the whole check result.
  const { translationJa, explanations, businessToneSuggestions } = await enrichErrors(
    text,
    draftErrors,
    businessMode
  ).catch((err) => {
    console.error("Gemini enrichment failed, continuing without it", err);
    return { translationJa: "", explanations: [], businessToneSuggestions: [] };
  });
  const t2 = Date.now();

  const explanationByIndex = new Map(explanations.map((e) => [e.index, e]));
  const enrichedErrors = draftErrors.map((error, index) => ({
    ...error,
    explanation: explanationByIndex.get(index)?.explanationJa ?? null,
    pronunciationGuide: explanationByIndex.get(index)?.pronunciationGuide ?? null,
  }));

  const overlaps = (offset: number, length: number) =>
    draftErrors.some(
      (e) => offset < e.offset + e.length && offset + length > e.offset
    );

  for (const suggestion of businessToneSuggestions) {
    const offset = text.indexOf(suggestion.originalSpan);
    if (offset === -1) continue;
    if (overlaps(offset, suggestion.originalSpan.length)) continue;
    enrichedErrors.push({
      offset,
      length: suggestion.originalSpan.length,
      originalSpan: suggestion.originalSpan,
      suggestedReplacement: suggestion.suggestedReplacement,
      category: "TONE_BUSINESS",
      ruleId: undefined,
      explanation: suggestion.explanationJa,
      pronunciationGuide: null,
    });
  }

  const wordCount = countWords(text);
  const errorCount = enrichedErrors.length;
  const cleanSessionBonus = computeCleanSessionBonus(wordCount, errorCount);
  const now = new Date();

  const result = await prisma.$transaction(async (tx) => {
    const checkSession = await tx.checkSession.create({
      data: {
        userId,
        originalText: text,
        wordCount,
        errorCount,
        pointsEarned: cleanSessionBonus,
        errors: {
          create: enrichedErrors.map((e) => ({
            offset: e.offset,
            length: e.length,
            originalSpan: e.originalSpan,
            suggestedReplacement: e.suggestedReplacement,
            category: e.category,
            ruleId: e.ruleId,
            explanation: e.explanation,
            pronunciationGuide: e.pronunciationGuide,
          })),
        },
      },
      include: { errors: true },
    });

    const progress = await tx.progress.upsert({
      where: { userId },
      create: { userId },
      update: {},
    });

    const streakUpdate = computeStreakUpdate({
      lastCheckDate: progress.lastCheckDate,
      currentStreak: progress.currentStreak,
      longestStreak: progress.longestStreak,
      now,
    });

    const pointsToAdd = cleanSessionBonus + streakUpdate.streakBonusPoints;

    const updatedProgress = await tx.progress.update({
      where: { userId },
      data: {
        totalScore: { increment: pointsToAdd },
        currentStreak: streakUpdate.currentStreak,
        longestStreak: streakUpdate.longestStreak,
        lastCheckDate: now,
        totalSessionsCount: { increment: 1 },
      },
    });

    const existingBadges = await tx.userBadge.findMany({
      where: { userId },
      select: { badgeKey: true },
    });

    const newBadgeKeys = evaluateNewBadges({
      totalSessionsCount: updatedProgress.totalSessionsCount,
      totalErrorsReviewed: updatedProgress.totalErrorsReviewed,
      currentStreak: updatedProgress.currentStreak,
      cleanSession: errorCount === 0 && wordCount >= 50,
      alreadyEarned: new Set(existingBadges.map((b) => b.badgeKey)),
    });

    if (newBadgeKeys.length > 0) {
      await tx.userBadge.createMany({
        data: newBadgeKeys.map((badgeKey) => ({ userId, badgeKey })),
        skipDuplicates: true,
      });
    }

    return { checkSession, progress: updatedProgress, newBadgeKeys };
  }, { maxWait: 10_000, timeout: 20_000 });
  const t3 = Date.now();
  console.log(
    `[check] languagetool=${t1 - t0}ms gemini=${t2 - t1}ms db=${t3 - t2}ms total=${t3 - t0}ms`
  );

  return NextResponse.json({
    sessionId: result.checkSession.id,
    errors: result.checkSession.errors,
    translationJa,
    progress: {
      totalScore: result.progress.totalScore,
      currentStreak: result.progress.currentStreak,
      longestStreak: result.progress.longestStreak,
    },
    pointsEarnedThisSession: cleanSessionBonus,
    newBadges: result.newBadgeKeys,
  });
  } catch (err) {
    console.error("POST /api/check failed", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "チェック中にエラーが発生しました" },
      { status: 500 }
    );
  }
}
