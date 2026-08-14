"use client";

import { useEffect, useState } from "react";
import {
  isSpeechRecognitionSupported,
  recognizeSpeech,
  scoreTranscriptMatch,
  speak,
} from "@/lib/speech";

interface TypingSentence {
  id: string;
  level: "easy" | "medium" | "hard";
  text: string;
}

type Phase = "idle" | "listening" | "result";

export default function PronunciationGame() {
  const [supported, setSupported] = useState(true);
  const [sentences, setSentences] = useState<TypingSentence[] | null>(null);
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("idle");
  const [transcript, setTranscript] = useState("");
  const [scores, setScores] = useState<number[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [summary, setSummary] = useState<{
    pointsEarned: number;
    totalScore: number;
    currentStreak: number;
    newBadges: string[];
  } | null>(null);

  useEffect(() => {
    // Browser feature detection can only run client-side; defaulting to
    // `true` for the SSR/first-paint render avoids a hydration mismatch,
    // then this corrects it right after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSupported(isSpeechRecognitionSupported());
    fetch("/api/pronunciation")
      .then((res) => res.json())
      .then((data) => setSentences(data.sentences));
  }, []);

  if (!supported) {
    return (
      <div className="card p-6 text-sm text-black/70 dark:text-white/70">
        お使いのブラウザは音声認識に対応していません。Google
        Chrome（PC・Android）でお試しください。
      </div>
    );
  }

  if (sentences === null) {
    return <p className="text-sm text-black/50 dark:text-white/50">読み込み中...</p>;
  }

  const current = sentences[index];
  const totalSentences = sentences.length;
  const finished = index >= totalSentences;

  async function finishSession(allScores: number[]) {
    const res = await fetch("/api/pronunciation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scores: allScores }),
    });
    const data = await res.json();
    if (res.ok) {
      setSummary({
        pointsEarned: data.pointsEarned,
        totalScore: data.progress.totalScore,
        currentStreak: data.progress.currentStreak,
        newBadges: data.newBadges ?? [],
      });
    }
  }

  async function handleListen() {
    if (!current) return;
    setPhase("listening");
    setErrorMsg(null);
    try {
      const spoken = await recognizeSpeech();
      const score = scoreTranscriptMatch(current.text, spoken);
      setTranscript(spoken);
      setScores((prev) => [...prev, score]);
      setPhase("result");
    } catch {
      setErrorMsg("聞き取れませんでした。もう一度お試しください。");
      setPhase("idle");
    }
  }

  function handleNext() {
    const nextIndex = index + 1;
    setTranscript("");
    setPhase("idle");
    setIndex(nextIndex);
    if (nextIndex >= totalSentences) finishSession(scores);
  }

  if (finished) {
    if (!summary) {
      return <p className="text-sm text-black/50 dark:text-white/50">集計中...</p>;
    }
    const avgScore = Math.round(scores.reduce((s, v) => s + v, 0) / scores.length);
    return (
      <div className="card p-8 text-center">
        <p className="text-4xl">🎤</p>
        <p className="mt-3 text-xl font-bold">平均一致度 {avgScore}%</p>
        <p className="mt-1 text-sm text-black/60 dark:text-white/60">
          獲得ポイント: +{summary.pointsEarned}（累計 {summary.totalScore} / 🔥
          {summary.currentStreak}日）
        </p>
        {summary.newBadges.length > 0 && (
          <p className="mt-2 text-amber-600 dark:text-amber-400">
            🎉 新しいバッジ獲得: {summary.newBadges.join(", ")}
          </p>
        )}
      </div>
    );
  }

  const lastScore = scores[scores.length - 1];

  return (
    <div className="card flex flex-col gap-4 p-5">
      <div>
        <div className="mb-1 flex justify-between text-xs text-black/50 dark:text-white/50">
          <span>
            文 {index + 1} / {sentences.length}
          </span>
        </div>
        <div className="progress-track">
          <div
            className="progress-fill"
            style={{ width: `${(index / sentences.length) * 100}%` }}
          />
        </div>
      </div>

      <p className="flex items-start gap-2 text-lg font-medium">
        {current.text}
        <button
          onClick={() => speak(current.text)}
          className="shrink-0 rounded-full px-1.5 text-base hover:bg-black/5 dark:hover:bg-white/10"
          aria-label="お手本を再生"
          title="お手本を再生"
        >
          🔊
        </button>
      </p>

      {phase !== "result" && (
        <button
          onClick={handleListen}
          disabled={phase === "listening"}
          className="btn-primary self-start"
        >
          {phase === "listening" ? "🎙️ 聞き取り中..." : "🎤 話す"}
        </button>
      )}

      {errorMsg && <p className="text-sm text-red-600">{errorMsg}</p>}

      {phase === "result" && (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-black/60 dark:text-white/60">認識結果: {transcript}</p>
          <p
            className={`text-2xl font-extrabold ${
              lastScore >= 95
                ? "text-green-600 dark:text-green-400"
                : lastScore >= 70
                ? "text-amber-600 dark:text-amber-400"
                : "text-red-600"
            }`}
          >
            一致度 {lastScore}%
          </p>
          <button onClick={handleNext} className="btn-primary self-start text-sm">
            次へ
          </button>
        </div>
      )}
    </div>
  );
}
