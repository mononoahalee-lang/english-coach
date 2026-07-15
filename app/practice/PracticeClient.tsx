"use client";

import { useEffect, useState } from "react";

type Deck = "weak-areas" | "business";

interface QuizItem {
  id: string;
  prompt: string;
  options: string[];
}

const DECK_LABELS: Record<Deck, string> = {
  "weak-areas": "苦手分野（スペル/文法）",
  business: "ビジネス表現",
};

export default function PracticeClient() {
  const [deck, setDeck] = useState<Deck>("weak-areas");

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">復習</h1>

      <div className="flex gap-2">
        {(Object.keys(DECK_LABELS) as Deck[]).map((d) => (
          <button
            key={d}
            onClick={() => setDeck(d)}
            className={`rounded-md px-3 py-1.5 text-sm ${
              deck === d
                ? "bg-blue-600 text-white"
                : "border border-black/15 dark:border-white/15"
            }`}
          >
            {DECK_LABELS[d]}
          </button>
        ))}
      </div>

      <DeckQuiz key={deck} deck={deck} />
    </div>
  );
}

function DeckQuiz({ deck }: { deck: Deck }) {
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
    return (
      <div className="rounded-md bg-black/5 p-5 text-center dark:bg-white/5">
        <p className="text-lg font-semibold">
          {correctCount} / {items.length} 問正解
        </p>
        <p className="mt-1 text-sm text-black/60 dark:text-white/60">
          獲得ポイント: {totalPoints}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 rounded-md border border-black/10 p-5 dark:border-white/10">
      <p className="text-xs text-black/50 dark:text-white/50">
        {index + 1} / {items.length}
      </p>
      <p className="font-medium">{current.prompt}</p>
      <div className="flex flex-col gap-2">
        {current.options.map((option) => {
          const isSelected = selected === option;
          return (
            <button
              key={option}
              onClick={() => handleAnswer(option)}
              disabled={Boolean(selected)}
              className={`rounded-md border px-3 py-2 text-left text-sm ${
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
            className={feedback === "correct" ? "text-green-700 dark:text-green-400" : "text-red-600"}
          >
            {feedback === "correct" ? "正解！" : "不正解"}
          </span>
          <button
            onClick={handleNext}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white"
          >
            次へ
          </button>
        </div>
      )}
    </div>
  );
}
