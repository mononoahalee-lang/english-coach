import businessPhrases from "@/content/business-phrases.json";

export interface QuizItem {
  id: string;
  prompt: string;
  options: string[];
}

interface WeakAreaSource {
  id: string;
  originalSpan: string;
  suggestedReplacement: string;
  offset: number;
  checkSession: { originalText: string };
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function contextSnippet(text: string, offset: number, length: number): string {
  const start = Math.max(0, offset - 30);
  const end = Math.min(text.length, offset + length + 30);
  const before = text.slice(start, offset);
  const after = text.slice(offset + length, end);
  return `${start > 0 ? "…" : ""}${before}____${after}${end < text.length ? "…" : ""}`;
}

function mutate(word: string): string {
  if (word.length <= 2) return `${word}e`;
  const mid = Math.floor(word.length / 2);
  return `${word.slice(0, mid)}${word.slice(mid + 1)}`;
}

export function buildWeakAreaQuiz(sources: WeakAreaSource[]): QuizItem[] {
  const replacementPool = sources.map((s) => s.suggestedReplacement);

  return sources.map((source) => {
    const decoyPool = replacementPool.filter((r) => r !== source.suggestedReplacement);
    const decoy = decoyPool.length > 0 ? shuffle(decoyPool)[0] : mutate(source.suggestedReplacement);

    const options = shuffle([
      source.suggestedReplacement,
      source.originalSpan,
      decoy,
      mutate(source.suggestedReplacement),
    ]);

    return {
      id: source.id,
      prompt: contextSnippet(source.checkSession.originalText, source.offset, source.originalSpan.length),
      options,
    };
  });
}

export function gradeWeakAreaAnswer(source: WeakAreaSource, selected: string): boolean {
  return selected.trim() === source.suggestedReplacement.trim();
}

export function buildBusinessQuiz(count: number): QuizItem[] {
  const picked = shuffle(businessPhrases).slice(0, count);
  return picked.map((phrase) => ({
    id: phrase.id,
    prompt: phrase.prompt,
    options: shuffle([phrase.correct, ...phrase.distractors]),
  }));
}

export function gradeBusinessAnswer(phraseId: string, selected: string): boolean {
  const phrase = businessPhrases.find((p) => p.id === phraseId);
  if (!phrase) return false;
  return selected.trim() === phrase.correct.trim();
}
