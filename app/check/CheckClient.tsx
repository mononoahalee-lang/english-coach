"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ErrorCategory } from "@/lib/languagetool";
import { CATEGORY_CSS_VAR, CATEGORY_ICONS, CATEGORY_LABELS } from "@/lib/categoryStyles";
import { speak } from "@/lib/speech";
import { buildSegments, type Segment } from "@/lib/segments";

const MAX_LEN = 4000;
const NEXT_STREAK_MILESTONES = [3, 7, 30];

type ReviewStatus = "PENDING" | "ACCEPTED" | "IGNORED";

interface ApiError {
  id: string;
  offset: number;
  length: number;
  originalSpan: string;
  suggestedReplacement: string;
  category: ErrorCategory;
  explanation: string | null;
  pronunciationGuide: string | null;
  status: ReviewStatus;
}

interface Progress {
  totalScore: number;
  currentStreak: number;
  longestStreak: number;
}

// Same walk as buildSegments, but marked spans show the suggested
// replacement text instead of the original (a DeepL-style "corrected" pane).
// Errors the user explicitly ignored keep showing their original wording.
function buildCorrectedSegments(text: string, errors: ApiError[]): Segment<ApiError>[] {
  const sorted = [...errors].sort((a, b) => a.offset - b.offset);
  const segments: Segment<ApiError>[] = [];
  let cursor = 0;

  for (const error of sorted) {
    if (error.offset < cursor) continue;
    if (error.offset > cursor) segments.push({ text: text.slice(cursor, error.offset) });
    const original = text.slice(error.offset, error.offset + error.length);
    const useSuggestion = error.status !== "IGNORED" && error.suggestedReplacement.length > 0;
    segments.push({ text: useSuggestion ? error.suggestedReplacement : original, error });
    cursor = error.offset + error.length;
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor) });
  return segments;
}

function nextMilestone(streak: number): number | null {
  return NEXT_STREAK_MILESTONES.find((m) => m > streak) ?? null;
}

export default function CheckClient() {
  const [text, setText] = useState("");
  const [checkedText, setCheckedText] = useState("");
  const [businessMode, setBusinessMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [errors, setErrors] = useState<ApiError[] | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [sessionPoints, setSessionPoints] = useState(0);
  const [newBadges, setNewBadges] = useState<string[]>([]);
  const [selectedErrorId, setSelectedErrorId] = useState<string | null>(null);
  const [reviewingErrorId, setReviewingErrorId] = useState<string | null>(null);
  const [translationJa, setTranslationJa] = useState("");

  const segments = useMemo(
    () => (errors ? buildSegments(checkedText, errors) : []),
    [checkedText, errors]
  );
  const correctedSegments = useMemo(
    () => (errors ? buildCorrectedSegments(checkedText, errors) : []),
    [checkedText, errors]
  );
  const selectedError = errors?.find((e) => e.id === selectedErrorId) ?? null;
  const presentCategories = useMemo(
    () => [...new Set((errors ?? []).map((e) => e.category))],
    [errors]
  );

  // DeepL-style: no manual "check" button. We auto-check once typing pauses,
  // keyed on the exact (text, businessMode) pair so we don't re-check (and
  // re-award points/streak) for content that's already been checked.
  const [lastCheckedKey, setLastCheckedKey] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function runCheck(checkText: string, checkBusinessMode: boolean) {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: checkText, businessMode: checkBusinessMode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "チェックに失敗しました");

      setCheckedText(checkText);
      setErrors(data.errors);
      setTranslationJa(data.translationJa ?? "");
      setProgress(data.progress);
      setSessionPoints(data.pointsEarnedThisSession);
      setNewBadges(data.newBadges ?? []);
      setSelectedErrorId(null);
      setLastCheckedKey(`${checkText}::${checkBusinessMode}`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "エラーが発生しました");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const key = `${text}::${businessMode}`;
    if (text.trim().length === 0 || key === lastCheckedKey) return;

    debounceRef.current = setTimeout(() => runCheck(text, businessMode), 1200);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [text, businessMode, lastCheckedKey]);

  async function handleReview(errorId: string, status: "ACCEPTED" | "IGNORED") {
    if (reviewingErrorId) return;
    setReviewingErrorId(errorId);
    // Optimistically lock the buttons right away so a slow response can't be
    // mistaken for an unresponsive button and trigger repeat clicks.
    setErrors((prev) =>
      prev ? prev.map((e) => (e.id === errorId ? { ...e, status } : e)) : prev
    );

    try {
      const res = await fetch(`/api/errors/${errorId}/review`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status !== 409) {
          // Revert the optimistic update so the user can retry.
          setErrors((prev) =>
            prev ? prev.map((e) => (e.id === errorId ? { ...e, status: "PENDING" } : e)) : prev
          );
        }
        return;
      }

      setSessionPoints((p) => p + data.pointsEarned);
      setProgress((p) => (p ? { ...p, totalScore: data.progress.totalScore } : p));
      if (data.newBadges?.length) setNewBadges((prev) => [...prev, ...data.newBadges]);
    } finally {
      setReviewingErrorId(null);
    }
  }

  const reviewedCount = errors?.filter((e) => e.status !== "PENDING").length ?? 0;
  const milestone = progress ? nextMilestone(progress.currentStreak) : null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">✍️ 英文チェック</h1>
        <p className="mt-1 text-sm text-black/60 dark:text-white/60">
          メールやWord文書の英文を貼り付けてチェックしましょう。
        </p>
      </div>

      <div className="card flex flex-col gap-3 p-4">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, MAX_LEN))}
          rows={8}
          placeholder="Paste your English text here..."
          className="w-full resize-y rounded-lg border border-black/10 bg-transparent p-3 font-mono text-sm outline-none focus:border-blue-500 dark:border-white/10"
        />
        <div className="flex items-center justify-between text-sm">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={businessMode}
              onChange={(e) => setBusinessMode(e.target.checked)}
            />
            💼 ビジネスメールとしてトーンもチェックする
          </label>
          <span className="text-black/50 dark:text-white/50">
            {text.length} / {MAX_LEN}
          </span>
        </div>
        <div className="h-5 text-sm text-black/50 dark:text-white/50">
          {loading ? (
            <span>🔍 チェック中...</span>
          ) : errors !== null && `${text}::${businessMode}` === lastCheckedKey ? (
            <span>✅ チェック済み</span>
          ) : text.trim().length > 0 ? (
            <span>入力を止めると自動でチェックされます...</span>
          ) : null}
        </div>
        {errorMsg && <p className="text-sm text-red-600">{errorMsg}</p>}
      </div>

      {errors && translationJa && (
        <div className="card p-5">
          <p className="mb-2 text-xs font-semibold text-black/40 dark:text-white/40">
            🇯🇵 日本語訳
          </p>
          <p className="leading-relaxed">{translationJa}</p>
        </div>
      )}

      {errors && errors.length === 0 && (
        <div className="card p-8 text-center">
          <p className="text-4xl">✨</p>
          <p className="mt-3 text-lg font-bold">
            誤りは見つかりませんでした！
            {sessionPoints > 0 && ` +${sessionPoints}pt`}
          </p>
          <p className="mt-1 text-sm text-black/60 dark:text-white/60">
            {businessMode
              ? "スペル・文法・ビジネストーンともに問題ありません。"
              : "スペル・文法に問題は見つかりませんでした。カジュアルな表現もチェックしたい場合は「ビジネスメールとしてトーンもチェックする」を有効にしてください。"}
          </p>
        </div>
      )}

      {errors && errors.length > 0 && (
        <div className="flex flex-col gap-4">
          {presentCategories.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {presentCategories.map((c) => (
                <span key={c} className="chip">
                  <span style={{ color: CATEGORY_CSS_VAR[c] }}>{CATEGORY_ICONS[c]}</span>
                  {CATEGORY_LABELS[c]}
                </span>
              ))}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="card p-5 leading-loose">
              <p className="mb-2 text-xs font-semibold text-black/40 dark:text-white/40">原文</p>
              {segments.map((seg, i) =>
                seg.error ? (
                  <mark
                    key={i}
                    onClick={() => setSelectedErrorId(seg.error!.id)}
                    className="cursor-pointer rounded px-0.5 py-0.5"
                    style={{
                      background: `color-mix(in srgb, ${CATEGORY_CSS_VAR[seg.error.category]} ${
                        selectedErrorId === seg.error.id ? "35%" : "18%"
                      }, transparent)`,
                      borderBottom: `2px solid ${CATEGORY_CSS_VAR[seg.error.category]}`,
                      opacity: seg.error.status === "PENDING" ? 1 : 0.5,
                    }}
                  >
                    {seg.text}
                  </mark>
                ) : (
                  <span key={i}>{seg.text}</span>
                )
              )}
            </div>

            <div className="card p-5 leading-loose">
              <p className="mb-2 text-xs font-semibold text-black/40 dark:text-white/40">
                校正後
              </p>
              {correctedSegments.map((seg, i) =>
                seg.error ? (
                  <mark
                    key={i}
                    onClick={() => setSelectedErrorId(seg.error!.id)}
                    className="cursor-pointer rounded px-0.5 py-0.5"
                    style={{
                      background:
                        seg.error.status === "IGNORED"
                          ? "transparent"
                          : `color-mix(in srgb, var(--status-good) ${
                              selectedErrorId === seg.error.id ? "35%" : "18%"
                            }, transparent)`,
                      borderBottom:
                        seg.error.status === "IGNORED"
                          ? `2px solid ${CATEGORY_CSS_VAR[seg.error.category]}`
                          : "2px solid var(--status-good)",
                    }}
                  >
                    {seg.text}
                  </mark>
                ) : (
                  <span key={i}>{seg.text}</span>
                )
              )}
            </div>
          </div>

          {selectedError && (
            <div
              className="card p-4"
              style={{ borderLeft: `4px solid ${CATEGORY_CSS_VAR[selectedError.category]}` }}
            >
              <div className="chip">
                <span style={{ color: CATEGORY_CSS_VAR[selectedError.category] }}>
                  {CATEGORY_ICONS[selectedError.category]}
                </span>
                {CATEGORY_LABELS[selectedError.category]}
              </div>
              <p className="mt-3 text-lg">
                <span className="text-red-600 line-through">{selectedError.originalSpan}</span>
                {" → "}
                <span className="font-bold text-green-700 dark:text-green-400">
                  {selectedError.suggestedReplacement}
                </span>
                <button
                  onClick={() => speak(selectedError.suggestedReplacement)}
                  className="ml-2 rounded-full px-2 py-0.5 text-base hover:bg-black/5 dark:hover:bg-white/10"
                  aria-label="発音を再生"
                  title="発音を再生"
                >
                  🔊
                </button>
              </p>
              {selectedError.explanation && (
                <p className="mt-2 text-sm text-black/70 dark:text-white/70">
                  {selectedError.explanation}
                </p>
              )}
              {selectedError.pronunciationGuide && (
                <p className="mt-1 text-sm text-black/50 dark:text-white/50">
                  発音: {selectedError.pronunciationGuide}
                </p>
              )}
              <div className="mt-4 flex items-center gap-2">
                <button
                  onClick={() => handleReview(selectedError.id, "ACCEPTED")}
                  disabled={selectedError.status !== "PENDING"}
                  className="rounded-full bg-green-600 px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
                >
                  ✓ Accept
                </button>
                <button
                  onClick={() => handleReview(selectedError.id, "IGNORED")}
                  disabled={selectedError.status !== "PENDING"}
                  className="rounded-full border border-black/20 px-4 py-1.5 text-sm font-semibold disabled:opacity-40 dark:border-white/20"
                >
                  Ignore
                </button>
                {reviewingErrorId === selectedError.id ? (
                  <span className="text-xs text-black/50 dark:text-white/50">処理中...</span>
                ) : (
                  selectedError.status !== "PENDING" && (
                    <span className="text-xs text-black/50 dark:text-white/50">
                      {selectedError.status === "ACCEPTED" ? "✅ 反映済み" : "スキップ済み"}
                    </span>
                  )
                )}
              </div>
            </div>
          )}

          <div className="card flex flex-col gap-3 p-5">
            <p className="text-sm text-black/70 dark:text-white/70">
              検出された誤り {errors.length}件（レビュー済み {reviewedCount}件）
            </p>
            <div className="flex flex-wrap items-center gap-6">
              <div>
                <p className="text-xs text-black/50 dark:text-white/50">今回のセッション</p>
                <p className="text-2xl font-extrabold">+{sessionPoints} pt</p>
              </div>
              {progress && (
                <>
                  <div>
                    <p className="text-xs text-black/50 dark:text-white/50">累計スコア</p>
                    <p className="text-2xl font-extrabold">🏆 {progress.totalScore}</p>
                  </div>
                  <div>
                    <p className="text-xs text-black/50 dark:text-white/50">ストリーク</p>
                    <p className="text-2xl font-extrabold">🔥 {progress.currentStreak}日</p>
                  </div>
                </>
              )}
            </div>
            {progress && milestone && (
              <div>
                <div className="mb-1 flex justify-between text-xs text-black/50 dark:text-white/50">
                  <span>次のマイルストーンまで</span>
                  <span>
                    {progress.currentStreak} / {milestone}日
                  </span>
                </div>
                <div className="progress-track">
                  <div
                    className="progress-fill"
                    style={{ width: `${(progress.currentStreak / milestone) * 100}%` }}
                  />
                </div>
              </div>
            )}
            {newBadges.length > 0 && (
              <p className="text-amber-600 dark:text-amber-400">
                🎉 新しいバッジ獲得: {newBadges.join(", ")}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
