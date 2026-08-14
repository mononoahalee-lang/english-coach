import Link from "next/link";
import { auth, signIn, signOut } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function NavBar() {
  const session = await auth();

  const progress = session?.user?.id
    ? await prisma.progress.findUnique({
        where: { userId: session.user.id },
        select: { totalScore: true, currentStreak: true },
      })
    : null;

  return (
    <header className="border-b border-black/10 dark:border-white/10">
      <nav className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
        <Link href="/" className="flex items-center gap-1.5 font-bold">
          <span>🦉</span>
          <span>English Coach</span>
        </Link>
        <div className="flex items-center gap-4 text-sm">
          {session?.user ? (
            <>
              {progress && (
                <span className="chip">
                  🏆 {progress.totalScore} ／ 🔥 {progress.currentStreak}
                </span>
              )}
              <Link href="/check">チェック</Link>
              <Link href="/dashboard">マイページ</Link>
              <Link href="/practice">学習</Link>
              <Link href="/history">履歴</Link>
              <form
                action={async () => {
                  "use server";
                  await signOut({ redirectTo: "/" });
                }}
              >
                <button type="submit" className="text-black/60 dark:text-white/60">
                  ログアウト
                </button>
              </form>
            </>
          ) : (
            <form
              action={async () => {
                "use server";
                await signIn("google", { redirectTo: "/check" });
              }}
            >
              <button type="submit" className="btn-primary">
                Googleでログイン
              </button>
            </form>
          )}
        </div>
      </nav>
    </header>
  );
}
