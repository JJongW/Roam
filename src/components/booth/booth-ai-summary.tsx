"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { api } from "@/lib/api/client";

/**
 * One-line AI summary of the booth, shown above the full intro. Lazy-loaded so
 * the page paints instantly; shows a subtle loading shimmer while fetching and
 * simply renders nothing if AI is off or the call fails (the intro still covers
 * it). Server-cached per booth, so it's at most one Gemini call per booth.
 */
export function BoothAiSummary({ boothId }: { boothId: string }) {
  const [summary, setSummary] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .post<{ summary: string }>("/api/ai/booth-summary", { boothId })
      .then((r) => {
        if (!cancelled) setSummary(r.summary?.trim() || null);
      })
      .catch(() => {
        if (!cancelled) setSummary(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [boothId]);

  if (!loading && !summary) return null;

  return (
    <div className="flex items-start gap-2 rounded-2xl border border-primary/25 bg-accent/40 p-3.5">
      <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
      {loading ? (
        <div className="flex-1 space-y-1.5" aria-label="AI 요약 불러오는 중">
          <div className="h-3.5 w-3/4 animate-pulse rounded bg-secondary" />
          <div className="h-3.5 w-1/2 animate-pulse rounded bg-secondary" />
        </div>
      ) : (
        <p className="flex-1 text-sm font-medium leading-snug text-foreground/90">
          {summary}
        </p>
      )}
    </div>
  );
}
