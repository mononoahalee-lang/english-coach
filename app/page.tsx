import { redirect } from "next/navigation";
import { auth, signIn } from "@/lib/auth";

export default async function Home() {
  const session = await auth();
  if (session?.user) redirect("/check");

  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center gap-6 px-4 py-24 text-center">
      <span className="text-5xl">🦉</span>
      <h1
        className="text-4xl font-extrabold"
        style={{
          backgroundImage: "var(--brand-gradient)",
          WebkitBackgroundClip: "text",
          backgroundClip: "text",
          color: "transparent",
        }}
      >
        English Coach
      </h1>
      <p className="text-black/70 dark:text-white/70">
        メールやWord文書の英文を貼り付けるだけで、スペル・文法・ビジネス英語のトーンをチェック。
        スコアとストリークを貯めながら、発音まで含めて楽しく英語力を伸ばせます。
      </p>
      <div className="flex gap-4 text-2xl">
        <span title="スコア">🏆</span>
        <span title="ストリーク">🔥</span>
        <span title="発音">🔊</span>
        <span title="ビジネス英語">💼</span>
      </div>
      <form
        action={async () => {
          "use server";
          await signIn("google", { redirectTo: "/check" });
        }}
      >
        <button type="submit" className="btn-primary">
          Googleでログインして始める
        </button>
      </form>
    </div>
  );
}
