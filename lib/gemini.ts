import type { DraftError } from "@/lib/types";

const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";

interface GeminiEnrichmentResult {
  explanations: {
    index: number;
    explanationJa: string;
    pronunciationGuide: string;
  }[];
  businessToneSuggestions: {
    originalSpan: string;
    suggestedReplacement: string;
    explanationJa: string;
  }[];
}

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    explanations: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          index: { type: "INTEGER" },
          explanationJa: { type: "STRING" },
          pronunciationGuide: { type: "STRING" },
        },
        required: ["index", "explanationJa", "pronunciationGuide"],
      },
    },
    businessToneSuggestions: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          originalSpan: { type: "STRING" },
          suggestedReplacement: { type: "STRING" },
          explanationJa: { type: "STRING" },
        },
        required: ["originalSpan", "suggestedReplacement", "explanationJa"],
      },
    },
  },
  required: ["explanations", "businessToneSuggestions"],
};

function buildPrompt(text: string, draftErrors: DraftError[], businessMode: boolean): string {
  const errorList = draftErrors
    .map(
      (e, i) =>
        `${i}. "${e.originalSpan}" -> "${e.suggestedReplacement}" (category: ${e.category})`
    )
    .join("\n");

  const businessInstruction = businessMode
    ? `\nThis text is a business email. Additionally, scan the ORIGINAL TEXT (not just the list above) for short phrases (a few words, NEVER a whole sentence or clause) that are too casual, blunt, or could come across as impolite in a professional business context, and suggest a more business-appropriate rewording for each. Keep each "originalSpan" as SHORT and SPECIFIC as possible, and never choose a span that overlaps or contains any of the DETECTED ERRORS listed above. Return these separately in "businessToneSuggestions", each with the exact original substring so it can be located in the text. If none are found, return an empty array.`
    : `\nReturn an empty array for "businessToneSuggestions".`;

  return `You are a friendly English writing coach helping a Japanese learner improve their English spelling, grammar, and pronunciation.

ORIGINAL TEXT:
"""
${text}
"""

DETECTED ERRORS (index. "wrong" -> "correct" (category)):
${errorList || "(none)"}

For each numbered error above, write a short (1-2 sentence) friendly explanation IN JAPANESE of why it was wrong and how to remember the correct form, plus a short, simple pronunciation guide for the corrected word/phrase written in katakana (e.g. "インタレスティング"). Return them in "explanations", matched by "index".
${businessInstruction}

Respond with JSON only, matching the required schema exactly.`;
}

export async function enrichErrors(
  text: string,
  draftErrors: DraftError[],
  businessMode: boolean
): Promise<GeminiEnrichmentResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");

  if (draftErrors.length === 0 && !businessMode) {
    return { explanations: [], businessToneSuggestions: [] };
  }

  const requestBody = JSON.stringify({
    contents: [{ parts: [{ text: buildPrompt(text, draftErrors, businessMode) }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
      thinkingConfig: { thinkingBudget: 0 },
    },
  });
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

  let res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: requestBody,
  });

  // Gemini's "high demand" 503s are usually transient; one short retry
  // clears most of them instead of losing the whole check result.
  if (res.status === 503) {
    await new Promise((r) => setTimeout(r, 1000));
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: requestBody,
    });
  }

  if (!res.ok) {
    throw new Error(`Gemini request failed: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  const rawText: string | undefined = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) throw new Error("Gemini response missing content");

  return JSON.parse(rawText) as GeminiEnrichmentResult;
}
