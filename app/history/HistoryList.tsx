"use client";

import { useState } from "react";
import type { ErrorCategory } from "@/lib/languagetool";
import { CATEGORY_CSS_VAR, CATEGORY_ICONS, CATEGORY_LABELS } from "@/lib/categoryStyles";
import { buildSegments } from "@/lib/segments";

interface HistoryError {
  id: string;
  offset: number;
  length: number;
  originalSpan: string;
  suggestedReplacement: string;
  category: ErrorCategory;
  explanation: string | null;
  status: "PENDING" | "ACCEPTED" | "IGNORED";
}

interface HistorySession {
  id: string;
  createdAt: string;
  originalText: string;
  wordCount: number;
  errorCount: number;
  pointsEarned: number;
  errors: HistoryError[];
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function HistoryList({ sessions }: { sessions: HistorySession[] }) {
  const [openId, setOpenId] = useState<string | null>(sessions[0]?.id ?? null);

  return (
    <div className="flex flex-col gap-3">
      {sessions.map((session) => {
        const isOpen = openId === session.id;
        return (
          <div key={session.id} className="card p-4">
            <button
              onClick={() => setOpenId(isOpen ? null : session.id)}
              className="flex w-full items-center justify-between gap-3 text-left"
            >
              <div>
                <p className="text-sm font-semibold">{formatDate(session.createdAt)}</p>
                <p className="mt-0.5 text-xs text-black/50 dark:text-white/50">
                  {session.wordCount}語 ・ 誤り{session.errorCount}件 ・ +{session.pointsEarned}pt
                </p>
              </div>
              <span className="text-black/40 dark:text-white/40">{isOpen ? "▲" : "▼"}</span>
            </button>

            {isOpen && (
              <div className="mt-4 leading-loose">
                {buildSegments(session.originalText, session.errors).map((seg, i) =>
                  seg.error ? (
                    <mark
                      key={i}
                      className="rounded px-0.5 py-0.5"
                      title={seg.error.explanation ?? undefined}
                      style={{
                        background: `color-mix(in srgb, ${CATEGORY_CSS_VAR[seg.error.category]} 18%, transparent)`,
                        borderBottom: `2px solid ${CATEGORY_CSS_VAR[seg.error.category]}`,
                      }}
                    >
                      {seg.text}
                    </mark>
                  ) : (
                    <span key={i}>{seg.text}</span>
                  )
                )}

                {session.errors.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {[...new Set(session.errors.map((e) => e.category))].map((c) => (
                      <span key={c} className="chip">
                        <span style={{ color: CATEGORY_CSS_VAR[c] }}>{CATEGORY_ICONS[c]}</span>
                        {CATEGORY_LABELS[c]}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
