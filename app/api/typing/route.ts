import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { pickTypingSentences, computeTypingPoints, type TypingResult } from "@/lib/typing";
import { computeStreakUpdate, evaluateNewBadges } from "@/lib/scoring";

const SESSION_SIZE = 5;

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({ sentences: pickTypingSentences(SESSION_SIZE) });
}

function isTypingResult(value: unknown): value is TypingResult {
  if (typeof value !== "object" || value === null) return false;
  const r = value as Record<string, unknown>;
  return typeof r.wpm === "number" && typeof r.accuracy === "number";
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const results: unknown = body?.results;
  if (!Array.isArray(results) || results.length === 0 || !results.every(isTypingResult)) {
    return NextResponse.json({ error: "results must be a non-empty array" }, { status: 400 });
  }

  const pointsEarned = computeTypingPoints(results);
  const now = new Date();

  try {
    const result = await prisma.$transaction(
      async (tx) => {
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

        const updatedProgress = await tx.progress.update({
          where: { userId: session.user.id },
          data: {
            totalScore: { increment: pointsEarned + streakUpdate.streakBonusPoints },
            currentStreak: streakUpdate.currentStreak,
            longestStreak: streakUpdate.longestStreak,
            lastCheckDate: now,
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
          cleanSession: false,
          alreadyEarned: new Set(existingBadges.map((b) => b.badgeKey)),
        });

        if (newBadgeKeys.length > 0) {
          await tx.userBadge.createMany({
            data: newBadgeKeys.map((badgeKey) => ({ userId: session.user.id, badgeKey })),
            skipDuplicates: true,
          });
        }

        return { progress: updatedProgress, newBadgeKeys };
      },
      { maxWait: 10_000, timeout: 20_000 }
    );

    return NextResponse.json({
      pointsEarned,
      progress: {
        totalScore: result.progress.totalScore,
        currentStreak: result.progress.currentStreak,
        longestStreak: result.progress.longestStreak,
      },
      newBadges: result.newBadgeKeys,
    });
  } catch (err) {
    console.error("POST /api/typing failed", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "更新中にエラーが発生しました" },
      { status: 500 }
    );
  }
}
