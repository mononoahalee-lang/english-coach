const LANGUAGETOOL_URL =
  process.env.LANGUAGETOOL_API_URL ?? "https://api.languagetool.org/v2/check";

export interface LanguageToolMatch {
  message: string;
  shortMessage: string;
  offset: number;
  length: number;
  replacements: { value: string }[];
  rule: {
    id: string;
    issueType?: string;
    category: { id: string; name: string };
  };
}

interface LanguageToolResponse {
  matches: LanguageToolMatch[];
}

export type ErrorCategory =
  | "SPELLING"
  | "GRAMMAR"
  | "PUNCTUATION"
  | "STYLE"
  | "TONE_BUSINESS";

const ISSUE_TYPE_TO_CATEGORY: Record<string, ErrorCategory> = {
  misspelling: "SPELLING",
  typographical: "PUNCTUATION",
  grammar: "GRAMMAR",
  style: "STYLE",
  locale_violation: "GRAMMAR",
};

export function mapIssueTypeToCategory(match: LanguageToolMatch): ErrorCategory {
  const issueType = match.rule.issueType ?? match.rule.category.id.toLowerCase();
  return ISSUE_TYPE_TO_CATEGORY[issueType] ?? "GRAMMAR";
}

export async function checkWithLanguageTool(text: string): Promise<LanguageToolMatch[]> {
  const res = await fetch(LANGUAGETOOL_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ text, language: "en-US" }).toString(),
  });

  if (!res.ok) {
    throw new Error(`LanguageTool request failed: ${res.status} ${await res.text()}`);
  }

  const data = (await res.json()) as LanguageToolResponse;
  return data.matches ?? [];
}
