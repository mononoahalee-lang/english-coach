import Link from "next/link";
import { getCurrentUserId } from "@/lib/currentUser";
import { prisma } from "@/lib/prisma";

export default async function NavBar() {
  const userId = await getCurrentUserId();
  const progress = await prisma.progress.findUnique({
    where: { userId },
    select: { totalScore: true, currentStreak: true },
  });

  return (
    <header className="border-b border-black/10 dark:border-white/10">
      <nav className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
        <Link href="/check" className="flex items-center gap-1.5 font-bold">
          <span>🦉</span>
          <span>English Coach</span>
        </Link>
        <div className="flex items-center gap-4 text-sm">
          {progress && (
            <span className="chip">
              🏆 {progress.totalScore} ／ 🔥 {progress.currentStreak}
            </span>
          )}
          <Link href="/check">チェック</Link>
          <Link href="/dashboard">マイページ</Link>
          <Link href="/practice">学習</Link>
          <Link href="/history">履歴</Link>
        </div>
      </nav>
    </header>
  );
}
