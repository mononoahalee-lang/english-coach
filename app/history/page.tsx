import { getCurrentUserId } from "@/lib/currentUser";
import { prisma } from "@/lib/prisma";
import type { ErrorCategory } from "@/lib/languagetool";
import HistoryList from "./HistoryList";

export default async function HistoryPage() {
  const userId = await getCurrentUserId();

  const sessions = await prisma.checkSession.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      errors: {
        select: {
          id: true,
          offset: true,
          length: true,
          originalSpan: true,
          suggestedReplacement: true,
          category: true,
          explanation: true,
          status: true,
        },
      },
    },
  });

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8">
      <div>
        <h1 className="text-2xl font-bold">🗂️ 履歴</h1>
        <p className="mt-1 text-sm text-black/60 dark:text-white/60">
          過去にチェックした英文を振り返れます。
        </p>
      </div>

      {sessions.length === 0 ? (
        <p className="text-sm text-black/50 dark:text-white/50">
          まだチェック履歴がありません。まずは英文チェックを行いましょう。
        </p>
      ) : (
        <HistoryList
          sessions={sessions.map((s) => ({
            id: s.id,
            createdAt: s.createdAt.toISOString(),
            originalText: s.originalText,
            wordCount: s.wordCount,
            errorCount: s.errorCount,
            pointsEarned: s.pointsEarned,
            errors: s.errors.map((e) => ({ ...e, category: e.category as ErrorCategory })),
          }))}
        />
      )}
    </div>
  );
}
