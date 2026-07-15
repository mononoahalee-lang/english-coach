"use client";

import { useMemo, useState } from "react";
import type { ErrorCategory } from "@/lib/languagetool";
import { CATEGORY_CSS_VAR, CATEGORY_LABELS } from "@/lib/categoryStyles";
import { speak } from "@/lib/speech";

const MAX_LEN = 4000;

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

interface Segment {
  text: string;
  error?: ApiError;
}

function buildSegments(text: string, errors: ApiError[]): Segment[] {
  const sorted = [...errors].sort((a, b) => a.offset - b.offset);
  const segments: Segment[] = [];
  let cursor = 0;

  for (const error of sorted) {
    if (error.offset < cursor) continue;
    if (error.offset > cursor) segments.push({ text: text.slice(cursor, error.offset) });
    segments.push({ text: text.slice(error.offset, error.offset + error.length), error });
    cursor = error.offset + error.length;
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor) });
  return segments;
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

  const segments = useMemo(
    () => (errors ? buildSegments(checkedText, errors) : []),
    [checkedText, errors]
  );
  const selectedError = errors?.find((e) => e.id === selectedErrorId) ?? null;

  async function handleCheck() {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, businessMode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "チェックに失敗しました");

      setCheckedText(text);
      setErrors(data.errors);
      setProgress(data.progress);
      setSessionPoints(data.pointsEarnedThisSession);
      setNewBadges(data.newBadges ?? []);
      setSelectedErrorId(null);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "エラーが発生しました");
    } finally {
      setLoading(false);
    }
  }

  async function handleReview(errorId: string, status: "ACCEPTED" | "IGNORED") {
    const res = await fetch(`/api/errors/${errorId}/review`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const data = await res.json();
    if (!res.ok) return;

    setErrors((prev) =>
      prev ? prev.map((e) => (e.id === errorId ? { ...e, status } : e)) : prev
    );
    setSessionPoints((p) => p + data.pointsEarned);
    setProgress((p) => (p ? { ...p, totalScore: data.progress.totalScore } : p));
    if (data.newBadges?.length) setNewBadges((prev) => [...prev, ...data.newBadges]);
  }

  const reviewedCount = errors?.filter((e) => e.status !== "PENDING").length ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">英文チェック</h1>
        <p className="mt-1 text-sm text-black/60 dark:text-white/60">
          メールやWord文書の英文を貼り付けてチェックしましょう。
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, MAX_LEN))}
          rows={8}
          placeholder="Paste your English text here..."
          className="w-full resize-y rounded-md border border-black/15 p-3 font-mono text-sm dark:border-white/15 dark:bg-black"
        />
        <div className="flex items-center justify-between text-sm">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={businessMode}
              onChange={(e) => setBusinessMode(e.target.checked)}
            />
            ビジネスメールとしてトーンもチェックする
          </label>
          <span className="text-black/50 dark:text-white/50">
            {text.length} / {MAX_LEN}
          </span>
        </div>
        <button
          onClick={handleCheck}
          disabled={loading || text.trim().length === 0}
          className="self-start rounded-md bg-blue-600 px-4 py-2 font-medium text-white disabled:opacity-50"
        >
          {loading ? "チェック中..." : "チェックする"}
        </button>
        {errorMsg && <p className="text-sm text-red-600">{errorMsg}</p>}
      </div>

      {errors && (
        <div className="flex flex-col gap-4">
          <div className="rounded-md border border-black/10 p-4 leading-relaxed dark:border-white/10">
            {segments.map((seg, i) =>
              seg.error ? (
                <mark
                  key={i}
                  onClick={() => setSelectedErrorId(seg.error!.id)}
                  className="cursor-pointer bg-transparent underline decoration-2 underline-offset-4"
                  style={{
                    textDecorationColor: CATEGORY_CSS_VAR[seg.error.category],
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

          {selectedError && (
            <div className="rounded-md border border-black/10 p-4 dark:border-white/10">
              <div className="flex items-center gap-2 text-xs font-medium">
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ background: CATEGORY_CSS_VAR[selectedError.category] }}
                />
                {CATEGORY_LABELS[selectedError.category]}
              </div>
              <p className="mt-2">
                <span className="text-red-600 line-through">{selectedError.originalSpan}</span>
                {" → "}
                <span className="font-semibold text-green-700 dark:text-green-400">
                  {selectedError.suggestedReplacement}
                </span>
                <button
                  onClick={() => speak(selectedError.suggestedReplacement)}
                  className="ml-2 rounded px-2 py-0.5 text-sm"
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
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => handleReview(selectedError.id, "ACCEPTED")}
                  disabled={selectedError.status !== "PENDING"}
                  className="rounded-md bg-green-600 px-3 py-1.5 text-sm text-white disabled:opacity-40"
                >
                  Accept
                </button>
                <button
                  onClick={() => handleReview(selectedError.id, "IGNORED")}
                  disabled={selectedError.status !== "PENDING"}
                  className="rounded-md border border-black/20 px-3 py-1.5 text-sm dark:border-white/20"
                >
                  Ignore
                </button>
                {selectedError.status !== "PENDING" && (
                  <span className="self-center text-xs text-black/50 dark:text-white/50">
                    {selectedError.status === "ACCEPTED" ? "反映済み" : "スキップ済み"}
                  </span>
                )}
              </div>
            </div>
          )}

          <div className="rounded-md bg-black/5 p-4 text-sm dark:bg-white/5">
            <p>
              検出された誤り: {errors.length}件（レビュー済み {reviewedCount}件） / 今回のセッションで獲得したポイント:{" "}
              <span className="font-semibold">{sessionPoints}</span>
            </p>
            {progress && (
              <p className="mt-1">
                累計スコア: <span className="font-semibold">{progress.totalScore}</span> ／
                現在のストリーク: <span className="font-semibold">{progress.currentStreak}日</span>
                （最長 {progress.longestStreak}日）
              </p>
            )}
            {newBadges.length > 0 && (
              <p className="mt-1 text-amber-600 dark:text-amber-400">
                新しいバッジ獲得: {newBadges.join(", ")}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
