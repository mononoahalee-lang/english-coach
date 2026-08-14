import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/currentUser";
import { prisma } from "@/lib/prisma";
import { pointsForReview, evaluateNewBadges } from "@/lib/scoring";

class AlreadyReviewedError extends Error {}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ errorId: string }> }
) {
  const userId = await getCurrentUserId();

  const { errorId } = await params;
  const body = await request.json().catch(() => null);
  const status: unknown = body?.status;
  if (status !== "ACCEPTED" && status !== "IGNORED") {
    return NextResponse.json(
      { error: 'status must be "ACCEPTED" or "IGNORED"' },
      { status: 400 }
    );
  }

  const detectedError = await prisma.detectedError.findUnique({
    where: { id: errorId },
    include: { checkSession: true },
  });

  if (!detectedError || detectedError.checkSession.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const points = pointsForReview(status);

  try {
    const result = await prisma.$transaction(
      async (tx) => {
        // Atomically flip PENDING -> status so two concurrent requests for the
        // same error can't both pass and double-award points.
        const { count } = await tx.detectedError.updateMany({
          where: { id: errorId, status: "PENDING" },
          data: { status, reviewedAt: new Date() },
        });
        if (count === 0) throw new AlreadyReviewedError();

        const updatedError = await tx.detectedError.findUniqueOrThrow({
          where: { id: errorId },
        });

        const progress = await tx.progress.update({
          where: { userId },
          data: {
            totalScore: { increment: points },
            totalErrorsReviewed: { increment: 1 },
          },
        });

        const existingBadges = await tx.userBadge.findMany({
          where: { userId },
          select: { badgeKey: true },
        });

        const newBadgeKeys = evaluateNewBadges({
          totalSessionsCount: progress.totalSessionsCount,
          totalErrorsReviewed: progress.totalErrorsReviewed,
          currentStreak: progress.currentStreak,
          cleanSession: false,
          alreadyEarned: new Set(existingBadges.map((b) => b.badgeKey)),
        });

        if (newBadgeKeys.length > 0) {
          await tx.userBadge.createMany({
            data: newBadgeKeys.map((badgeKey) => ({ userId, badgeKey })),
            skipDuplicates: true,
          });
        }

        return { updatedError, progress, newBadgeKeys };
      },
      { maxWait: 10_000, timeout: 20_000 }
    );

    return NextResponse.json({
      error: result.updatedError,
      pointsEarned: points,
      progress: {
        totalScore: result.progress.totalScore,
        totalErrorsReviewed: result.progress.totalErrorsReviewed,
      },
      newBadges: result.newBadgeKeys,
    });
  } catch (err) {
    if (err instanceof AlreadyReviewedError) {
      return NextResponse.json({ error: "Error already reviewed" }, { status: 409 });
    }
    console.error("PATCH /api/errors/[errorId]/review failed", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "更新中にエラーが発生しました" },
      { status: 500 }
    );
  }
}
