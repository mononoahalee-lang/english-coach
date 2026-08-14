import typingSentences from "@/content/typing-sentences.json";

export interface TypingSentence {
  id: string;
  level: "easy" | "medium" | "hard";
  text: string;
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function pickTypingSentences(count: number): TypingSentence[] {
  return shuffle(typingSentences as TypingSentence[]).slice(0, count);
}

export interface TypingResult {
  wpm: number;
  accuracy: number;
}

const BASE_POINTS_PER_SENTENCE = 2;
const ACCURACY_BONUS_THRESHOLD = 95;
const ACCURACY_BONUS_POINTS = 2;
const WPM_BONUS_THRESHOLD = 40;
const WPM_BONUS_POINTS = 3;

export function computeTypingPoints(results: TypingResult[]): number {
  return results.reduce((total, r) => {
    let points = BASE_POINTS_PER_SENTENCE;
    if (r.accuracy >= ACCURACY_BONUS_THRESHOLD) points += ACCURACY_BONUS_POINTS;
    if (r.wpm >= WPM_BONUS_THRESHOLD) points += WPM_BONUS_POINTS;
    return total + points;
  }, 0);
}

const BASE_POINTS_PER_UTTERANCE = 2;
const PRONUNCIATION_GOOD_THRESHOLD = 70;
const PRONUNCIATION_GOOD_BONUS = 2;
const PRONUNCIATION_GREAT_THRESHOLD = 95;
const PRONUNCIATION_GREAT_BONUS = 3;

export function computePronunciationPoints(matchScores: number[]): number {
  return matchScores.reduce((total, score) => {
    let points = BASE_POINTS_PER_UTTERANCE;
    if (score >= PRONUNCIATION_GREAT_THRESHOLD) points += PRONUNCIATION_GREAT_BONUS;
    else if (score >= PRONUNCIATION_GOOD_THRESHOLD) points += PRONUNCIATION_GOOD_BONUS;
    return total + points;
  }, 0);
}
