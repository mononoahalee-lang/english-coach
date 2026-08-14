"use client";

import { useEffect, useState } from "react";
import TypingGame from "./TypingGame";
import PronunciationGame from "./PronunciationGame";

type Deck = "weak-areas" | "business" | "typing" | "pronunciation";

interface QuizItem {
  id: string;
  prompt: string;
  options: string[];
}

interface ModeInfo {
  icon: string;
  title: string;
  description: string;
}

const MODES: Record<Deck, ModeInfo> = {
  "weak-areas": {
    icon: "🧩",
    title: "苦手分野",
    description: "英文チェックで見つかった、自分のスペル・文法ミスを復習する4択クイズ",
  },
  business: {
    icon: "💼",
    title: "ビジネス表現",
    description: "丁寧で自然なビジネス英語の言い回しを覚える4択クイズ",
  },
  typing: {
    icon: "⌨️",
    title: "タイピング練習",
    description: "英文を制限時間内でタイプして、速度(WPM)と正確性を鍛える",
  },
  pronunciation: {
    icon: "🎤",
    title: "発音チャレンジ",
    description: "英文を声に出して読み、お手本との一致度を判定する（Chrome推奨）",
  },
};

export default function PracticeClient() {
  const [deck, setDeck] = useState<Deck | null>(null);

  if (deck === null) {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-bold">🎯 学習</h1>
          <p className="mt-1 text-sm text-black/60 dark:text-white/60">
            練習したいモードを選んでください。
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {(Object.keys(MODES) as Deck[]).map((d) => (
            <button
              key={d}
              onClick={() => setDeck(d)}
              className="card flex flex-col items-start gap-2 p-5 text-left transition-transform hover:-translate-y-0.5"
            >
              <span className="text-3xl">{MODES[d].icon}</span>
              <span className="font-bold">{MODES[d].title}</span>
              <span className="text-xs text-black/60 dark:text-white/60">
                {MODES[d].description}
              </span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <button
          onClick={() => setDeck(null)}
          className="chip cursor-pointer text-sm text-black/70 dark:text-white/70"
        >
          ← モード選択
        </button>
        <h1 className="text-xl font-bold">
          {MODES[deck].icon} {MODES[deck].title}
        </h1>
      </div>

      {deck === "typing" ? (
        <TypingGame key={deck} />
      ) : deck === "pronunciation" ? (
        <PronunciationGame key={deck} />
      ) : (
        <DeckQuiz key={deck} deck={deck} />
      )}
    </div>
  );
}

function DeckQuiz({ deck }: { deck: "weak-areas" | "business" }) {
  const [items, setItems] = useState<QuizItem[] | null>(null);
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<"correct" | "incorrect" | null>(null);
  const [correctCount, setCorrectCount] = useState(0);
  const [totalPoints, setTotalPoints] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/practice?deck=${deck}`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setItems(data.items);
      });
    return () => {
      cancelled = true;
    };
  }, [deck]);

  async function handleAnswer(option: string) {
    if (!items || selected) return;
    setSelected(option);

    const res = await fetch("/api/practice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deck, itemId: items[index].id, selected: option }),
    });
    const data = await res.json();
    setFeedback(data.correct ? "correct" : "incorrect");
    if (data.correct) setCorrectCount((c) => c + 1);
    setTotalPoints((p) => p + data.pointsEarned);
  }

  function handleNext() {
    setSelected(null);
    setFeedback(null);
    setIndex((i) => i + 1);
  }

  if (items === null) {
    return <p className="text-sm text-black/50 dark:text-white/50">読み込み中...</p>;
  }

  if (items.length === 0) {
    return (
      <p className="text-sm text-black/50 dark:text-white/50">
        復習できる問題がまだありません。まずは英文チェックを行いましょう。
      </p>
    );
  }

  const current = items[index];
  const finished = index >= items.length;

  if (finished) {
    const ratio = correctCount / items.length;
    const trophy = ratio === 1 ? "🏆" : ratio >= 0.7 ? "🎉" : "💪";
    return (
      <div className="card p-8 text-center">
        <p className="text-4xl">{trophy}</p>
        <p className="mt-3 text-xl font-bold">
          {correctCount} / {items.length} 問正解
        </p>
        <p className="mt-1 text-sm text-black/60 dark:text-white/60">
          獲得ポイント: +{totalPoints}
        </p>
      </div>
    );
  }

  return (
    <div className="card flex flex-col gap-4 p-5">
      <div>
        <div className="mb-1 flex justify-between text-xs text-black/50 dark:text-white/50">
          <span>問題 {index + 1} / {items.length}</span>
        </div>
        <div className="progress-track">
          <div
            className="progress-fill"
            style={{ width: `${(index / items.length) * 100}%` }}
          />
        </div>
      </div>
      <p className="text-lg font-medium">{current.prompt}</p>
      <div className="flex flex-col gap-2">
        {current.options.map((option) => {
          const isSelected = selected === option;
          return (
            <button
              key={option}
              onClick={() => handleAnswer(option)}
              disabled={Boolean(selected)}
              className={`rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                isSelected && feedback === "correct"
                  ? "border-green-600 bg-green-600/10"
                  : isSelected && feedback === "incorrect"
                  ? "border-red-600 bg-red-600/10"
                  : "border-black/15 dark:border-white/15"
              } disabled:opacity-70`}
            >
              {option}
            </button>
          );
        })}
      </div>
      {feedback && (
        <div className="flex items-center justify-between">
          <span
            className={`font-semibold ${
              feedback === "correct" ? "text-green-700 dark:text-green-400" : "text-red-600"
            }`}
          >
            {feedback === "correct" ? "✅ 正解！" : "❌ 不正解"}
          </span>
          <button onClick={handleNext} className="btn-primary text-sm">
            次へ
          </button>
        </div>
      )}
    </div>
  );
}
