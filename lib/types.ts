import type { ErrorCategory } from "@/lib/languagetool";

export interface DraftError {
  offset: number;
  length: number;
  originalSpan: string;
  suggestedReplacement: string;
  category: ErrorCategory;
  ruleId?: string;
}

export interface EnrichedError extends DraftError {
  explanation: string;
  pronunciationGuide: string;
}
