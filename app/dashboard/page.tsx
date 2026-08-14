import { getCurrentUserId } from "@/lib/currentUser";
import { prisma } from "@/lib/prisma";
import { CATEGORY_CSS_VAR, CATEGORY_ICONS, CATEGORY_LABELS } from "@/lib/categoryStyles";
import type { ErrorCategory } from "@/lib/languagetool";
import TrendChart from "@/components/TrendChart";
import Link from "next/link";

const STREAK_STRIP_DAYS = 14;

function utcDayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export default async function DashboardPage() {
  const userId = await getCurrentUserId();

  const [progress, recentSessions, weakAreas] = await Promise.all([
    prisma.progress.upsert({
      where: { userId },
      create: { userId },
      update: {},
    }),
    prisma.checkSession.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
      take: 30,
      select: { createdAt: true, errorCount: true },
    }),
    prisma.detectedError.groupBy({
      by: ["category"],
      where: { checkSession: { userId } },
      _count: { _all: true },
      orderBy: { _count: { category: "desc" } },
      take: 8,
    }),
  ]);

  const trendData = recentSessions.map((s) => ({
    date: `${s.createdAt.getMonth() + 1}/${s.createdAt.getDate()}`,
    errorCount: s.errorCount,
  }));

  const checkedDays = new Set(recentSessions.map((s) => utcDayKey(s.createdAt)));
  const today = new Date();
  const strip = Array.from({ length: STREAK_STRIP_DAYS }, (_, i) => {
    const day = new Date(today);
    day.setUTCDate(today.getUTCDate() - (STREAK_STRIP_DAYS - 1 - i));
    return { key: utcDayKey(day), checked: checkedDays.has(utcDayKey(day)) };
  });

  const maxWeakAreaCount = Math.max(1, ...weakAreas.map((w) => w._count._all));

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-8">
      <h1 className="text-2xl font-bold">📊 マイページ</h1>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatTile icon="🏆" label="総スコア" value={progress.totalScore} />
        <StatTile icon="🔥" label="現在のストリーク" value={`${progress.currentStreak}日`} />
        <StatTile icon="⭐" label="最長ストリーク" value={`${progress.longestStreak}日`} />
        <StatTile icon="📝" label="総セッション数" value={progress.totalSessionsCount} />
      </div>

      <section className="card p-5">
        <h2 className="mb-3 text-sm font-semibold text-black/70 dark:text-white/70">
          直近{STREAK_STRIP_DAYS}日間の記録
        </h2>
        <div className="flex gap-1.5">
          {strip.map((d) => (
            <span
              key={d.key}
              title={d.key}
              className="flex h-6 w-6 items-center justify-center rounded-full text-xs"
              style={{
                background: d.checked
                  ? "var(--status-good)"
                  : "color-mix(in srgb, var(--chart-axis) 15%, transparent)",
              }}
            >
              {d.checked ? "🔥" : ""}
            </span>
          ))}
        </div>
      </section>

      <section className="card p-5">
        <h2 className="mb-3 text-sm font-semibold text-black/70 dark:text-white/70">
          セッションごとの誤り数の推移
        </h2>
        <TrendChart data={trendData} />
      </section>

      <section className="card p-5">
        <h2 className="mb-3 text-sm font-semibold text-black/70 dark:text-white/70">
          苦手分野
        </h2>
        {weakAreas.length === 0 ? (
          <p className="text-sm text-black/50 dark:text-white/50">
            まだ十分なデータがありません。チェックを重ねると苦手分野が見えてきます。
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {weakAreas.map((w) => {
              const category = w.category as ErrorCategory;
              const count = w._count._all;
              return (
                <div key={category} className="flex items-center gap-3 text-sm">
                  <span className="w-32 shrink-0">
                    {CATEGORY_ICONS[category]} {CATEGORY_LABELS[category]}
                  </span>
                  <div className="progress-track flex-1">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${(count / maxWeakAreaCount) * 100}%`,
                        background: CATEGORY_CSS_VAR[category],
                      }}
                    />
                  </div>
                  <span className="w-10 shrink-0 text-right tabular-nums">{count}</span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <Link href="/practice" className="btn-primary self-start">
        🎯 苦手分野を復習する
      </Link>
    </div>
  );
}

function StatTile({
  icon,
  label,
  value,
}: {
  icon: string;
  label: string;
  value: string | number;
}) {
  return (
    <div className="card p-4">
      <p className="text-xs text-black/50 dark:text-white/50">{label}</p>
      <p className="mt-1 text-2xl font-extrabold tabular-nums">
        {icon} {value}
      </p>
    </div>
  );
}
