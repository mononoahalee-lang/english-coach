import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/currentUser";
import { prisma } from "@/lib/prisma";
import {
  buildBusinessQuiz,
  buildWeakAreaQuiz,
  gradeBusinessAnswer,
  gradeWeakAreaAnswer,
} from "@/lib/practice";

const QUIZ_SIZE = 10;
const CORRECT_ANSWER_POINTS = 2;

export async function GET(request: Request) {
  const userId = await getCurrentUserId();

  const deck = new URL(request.url).searchParams.get("deck") ?? "weak-areas";

  if (deck === "business") {
    return NextResponse.json({ deck, items: buildBusinessQuiz(QUIZ_SIZE) });
  }

  if (deck !== "weak-areas") {
    return NextResponse.json({ error: "unknown deck" }, { status: 400 });
  }

  const candidates = await prisma.detectedError.findMany({
    where: {
      category: { not: "TONE_BUSINESS" },
      status: { in: ["ACCEPTED", "IGNORED"] },
      checkSession: { userId },
    },
    include: { checkSession: { select: { originalText: true } } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const sample = candidates.sort(() => Math.random() - 0.5).slice(0, QUIZ_SIZE);
  return NextResponse.json({ deck, items: buildWeakAreaQuiz(sample) });
}

export async function POST(request: Request) {
  const userId = await getCurrentUserId();

  const body = await request.json().catch(() => null);
  const deck: unknown = body?.deck;
  const itemId: unknown = body?.itemId;
  const selected: unknown = body?.selected;

  if (typeof itemId !== "string" || typeof selected !== "string") {
    return NextResponse.json({ error: "itemId and selected are required" }, { status: 400 });
  }

  let correct: boolean;

  if (deck === "business") {
    correct = gradeBusinessAnswer(itemId, selected);
  } else if (deck === "weak-areas") {
    const source = await prisma.detectedError.findUnique({
      where: { id: itemId },
      include: { checkSession: { select: { userId: true, originalText: true } } },
    });
    if (!source || source.checkSession.userId !== userId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    correct = gradeWeakAreaAnswer(source, selected);
  } else {
    return NextResponse.json({ error: "unknown deck" }, { status: 400 });
  }

  const pointsEarned = correct ? CORRECT_ANSWER_POINTS : 0;
  if (pointsEarned > 0) {
    await prisma.progress.upsert({
      where: { userId },
      create: { userId, totalScore: pointsEarned },
      update: { totalScore: { increment: pointsEarned } },
    });
  }

  return NextResponse.json({ correct, pointsEarned });
}
