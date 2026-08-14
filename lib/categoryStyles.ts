import type { ErrorCategory } from "@/lib/languagetool";

export const CATEGORY_LABELS: Record<ErrorCategory, string> = {
  SPELLING: "スペル",
  GRAMMAR: "文法",
  PUNCTUATION: "句読点",
  STYLE: "文体",
  TONE_BUSINESS: "ビジネストーン",
};

export const CATEGORY_ICONS: Record<ErrorCategory, string> = {
  SPELLING: "🔤",
  GRAMMAR: "📝",
  PUNCTUATION: "✏️",
  STYLE: "🎨",
  TONE_BUSINESS: "💼",
};

export const CATEGORY_CSS_VAR: Record<ErrorCategory, string> = {
  SPELLING: "var(--cat-spelling)",
  GRAMMAR: "var(--cat-grammar)",
  PUNCTUATION: "var(--cat-punctuation)",
  STYLE: "var(--cat-style)",
  TONE_BUSINESS: "var(--cat-tone-business)",
};

export const CATEGORY_ORDER: ErrorCategory[] = [
  "SPELLING",
  "GRAMMAR",
  "PUNCTUATION",
  "STYLE",
  "TONE_BUSINESS",
];
