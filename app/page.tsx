import { redirect } from "next/navigation";
import { auth, signIn } from "@/lib/auth";

export default async function Home() {
  const session = await auth();
  if (session?.user) redirect("/check");

  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center gap-6 px-4 py-24 text-center">
      <h1 className="text-3xl font-bold">English Coach</h1>
      <p className="text-black/70 dark:text-white/70">
        メールやWord文書の英文を貼り付けるだけで、スペル・文法・ビジネス英語のトーンをチェック。
        スコアとストリークを貯めながら、発音まで含めて楽しく英語力を伸ばせます。
      </p>
      <form
        action={async () => {
          "use server";
          await signIn("google", { redirectTo: "/check" });
        }}
      >
        <button
          type="submit"
          className="rounded-md bg-blue-600 px-5 py-2.5 font-medium text-white"
        >
          Googleでログインして始める
        </button>
      </form>
    </div>
  );
}
