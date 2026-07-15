import Link from "next/link";
import { auth, signIn, signOut } from "@/lib/auth";

export default async function NavBar() {
  const session = await auth();

  return (
    <header className="border-b border-black/10 dark:border-white/10">
      <nav className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
        <Link href="/" className="font-semibold">
          English Coach
        </Link>
        <div className="flex items-center gap-4 text-sm">
          {session?.user ? (
            <>
              <Link href="/check">チェック</Link>
              <Link href="/dashboard">マイページ</Link>
              <Link href="/practice">復習</Link>
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
              <button
                type="submit"
                className="rounded-md bg-blue-600 px-3 py-1.5 text-white"
              >
                Googleでログイン
              </button>
            </form>
          )}
        </div>
      </nav>
    </header>
  );
}
