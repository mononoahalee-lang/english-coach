import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { pointsForReview, evaluateNewBadges } from "@/lib/scoring";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ errorId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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

  if (!detectedError || detectedError.checkSession.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (detectedError.status !== "PENDING") {
    return NextResponse.json({ error: "Error already reviewed" }, { status: 409 });
  }

  const points = pointsForReview(status);

  const result = await prisma.$transaction(async (tx) => {
    const updatedError = await tx.detectedError.update({
      where: { id: errorId },
      data: { status, reviewedAt: new Date() },
    });

    const progress = await tx.progress.update({
      where: { userId: session.user.id },
      data: {
        totalScore: { increment: points },
        totalErrorsReviewed: { increment: 1 },
      },
    });

    const existingBadges = await tx.userBadge.findMany({
      where: { userId: session.user.id },
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
        data: newBadgeKeys.map((badgeKey) => ({ userId: session.user.id, badgeKey })),
        skipDuplicates: true,
      });
    }

    return { updatedError, progress, newBadgeKeys };
  });

  return NextResponse.json({
    error: result.updatedError,
    pointsEarned: points,
    progress: {
      totalScore: result.progress.totalScore,
      totalErrorsReviewed: result.progress.totalErrorsReviewed,
    },
    newBadges: result.newBadgeKeys,
  });
}
