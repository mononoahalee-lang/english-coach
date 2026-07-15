import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
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
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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

  const matches = await checkWithLanguageTool(text);

  const draftErrors: DraftError[] = matches.map((match) => ({
    offset: match.offset,
    length: match.length,
    originalSpan: text.slice(match.offset, match.offset + match.length),
    suggestedReplacement: match.replacements[0]?.value ?? "",
    category: mapIssueTypeToCategory(match),
    ruleId: match.rule.id,
  }));

  const { explanations, businessToneSuggestions } = await enrichErrors(
    text,
    draftErrors,
    businessMode
  );

  const explanationByIndex = new Map(explanations.map((e) => [e.index, e]));
  const enrichedErrors = draftErrors.map((error, index) => ({
    ...error,
    explanation: explanationByIndex.get(index)?.explanationJa ?? null,
    pronunciationGuide: explanationByIndex.get(index)?.pronunciationGuide ?? null,
  }));

  for (const suggestion of businessToneSuggestions) {
    const offset = text.indexOf(suggestion.originalSpan);
    if (offset === -1) continue;
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
        userId: session.user.id,
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
      where: { userId: session.user.id },
      create: { userId: session.user.id },
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
      where: { userId: session.user.id },
      data: {
        totalScore: { increment: pointsToAdd },
        currentStreak: streakUpdate.currentStreak,
        longestStreak: streakUpdate.longestStreak,
        lastCheckDate: now,
        totalSessionsCount: { increment: 1 },
      },
    });

    const existingBadges = await tx.userBadge.findMany({
      where: { userId: session.user.id },
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
        data: newBadgeKeys.map((badgeKey) => ({ userId: session.user.id, badgeKey })),
        skipDuplicates: true,
      });
    }

    return { checkSession, progress: updatedProgress, newBadgeKeys };
  });

  return NextResponse.json({
    sessionId: result.checkSession.id,
    errors: result.checkSession.errors,
    progress: {
      totalScore: result.progress.totalScore,
      currentStreak: result.progress.currentStreak,
      longestStreak: result.progress.longestStreak,
    },
    pointsEarnedThisSession: cleanSessionBonus,
    newBadges: result.newBadgeKeys,
  });
}
