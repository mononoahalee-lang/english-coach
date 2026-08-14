"use client";

import { useEffect, useRef, useState } from "react";

interface TypingSentence {
  id: string;
  level: "easy" | "medium" | "hard";
  text: string;
}

interface TypingResult {
  wpm: number;
  accuracy: number;
}

function computeResult(target: string, typed: string, elapsedMs: number): TypingResult {
  let correct = 0;
  for (let i = 0; i < target.length; i++) {
    if (typed[i] === target[i]) correct++;
  }
  const accuracy = Math.round((correct / target.length) * 100);
  const minutes = Math.max(elapsedMs / 60_000, 1 / 60_000);
  const wpm = Math.round(target.length / 5 / minutes);
  return { wpm, accuracy };
}

export default function TypingGame() {
  const [sentences, setSentences] = useState<TypingSentence[] | null>(null);
  const [index, setIndex] = useState(0);
  const [typed, setTyped] = useState("");
  const [results, setResults] = useState<TypingResult[]>([]);
  const [summary, setSummary] = useState<{
    pointsEarned: number;
    totalScore: number;
    currentStreak: number;
    newBadges: string[];
  } | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/typing")
      .then((res) => res.json())
      .then((data) => setSentences(data.sentences));
  }, []);

  useEffect(() => {
    inputRef.current?.focus();
  }, [index]);

  if (sentences === null) {
    return <p className="text-sm text-black/50 dark:text-white/50">読み込み中...</p>;
  }

  const current = sentences[index];
  const totalSentences = sentences.length;
  const finished = index >= totalSentences;

  async function finishSession(allResults: TypingResult[]) {
    const res = await fetch("/api/typing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ results: allResults }),
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

  function handleChange(value: string) {
    if (!current) return;
    if (startTimeRef.current === null) startTimeRef.current = Date.now();
    const clamped = value.slice(0, current.text.length);
    setTyped(clamped);

    if (clamped.length === current.text.length) {
      const elapsed = Date.now() - (startTimeRef.current ?? Date.now());
      const result = computeResult(current.text, clamped, elapsed);
      const nextResults = [...results, result];
      setResults(nextResults);
      startTimeRef.current = null;
      setTyped("");

      if (index + 1 >= totalSentences) {
        setIndex(index + 1);
        finishSession(nextResults);
      } else {
        setIndex(index + 1);
      }
    }
  }

  if (finished) {
    if (!summary) {
      return <p className="text-sm text-black/50 dark:text-white/50">集計中...</p>;
    }
    const avgWpm = Math.round(results.reduce((s, r) => s + r.wpm, 0) / results.length);
    const avgAccuracy = Math.round(results.reduce((s, r) => s + r.accuracy, 0) / results.length);
    return (
      <div className="card p-8 text-center">
        <p className="text-4xl">⌨️</p>
        <p className="mt-3 text-xl font-bold">
          平均 {avgWpm} WPM ・ 正確性 {avgAccuracy}%
        </p>
        <p className="mt-1 text-sm text-black/60 dark:text-white/60">
          獲得ポイント: +{summary.pointsEarned}（累計 {summary.totalScore} / 🔥{summary.currentStreak}日）
        </p>
        {summary.newBadges.length > 0 && (
          <p className="mt-2 text-amber-600 dark:text-amber-400">
            🎉 新しいバッジ獲得: {summary.newBadges.join(", ")}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="card flex flex-col gap-4 p-5">
      <div>
        <div className="mb-1 flex justify-between text-xs text-black/50 dark:text-white/50">
          <span>
            文 {index + 1} / {sentences.length}
          </span>
          <span className="uppercase">{current.level}</span>
        </div>
        <div className="progress-track">
          <div
            className="progress-fill"
            style={{ width: `${(index / sentences.length) * 100}%` }}
          />
        </div>
      </div>

      <p className="select-none font-mono text-lg leading-relaxed tracking-wide">
        {current.text.split("").map((char, i) => {
          const typedChar = typed[i];
          let className = "text-black/35 dark:text-white/35";
          if (typedChar !== undefined) {
            className =
              typedChar === char
                ? "text-green-600 dark:text-green-400"
                : "bg-red-600/20 text-red-600 dark:text-red-400";
          } else if (i === typed.length) {
            className = "border-b-2 border-blue-500 text-black dark:text-white";
          }
          return (
            <span key={i} className={className}>
              {char}
            </span>
          );
        })}
      </p>

      <input
        ref={inputRef}
        type="text"
        value={typed}
        onChange={(e) => handleChange(e.target.value)}
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        className="w-full rounded-lg border border-black/10 bg-transparent p-3 font-mono text-sm outline-none focus:border-blue-500 dark:border-white/10"
        placeholder="ここに入力..."
      />
    </div>
  );
}
