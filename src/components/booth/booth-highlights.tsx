"use client";

import { useEffect, useState } from "react";
import { BookOpen, Gift } from "lucide-react";
import { api } from "@/lib/api/client";
import { LOADING_MESSAGES } from "@/lib/loading-messages";
import { useRotatingMessage } from "@/lib/hooks/use-rotating-message";
import { RoamMotion, THINKING_POOL } from "@/components/companion/roam-motion";

type Extract = { summary: string; newReleases: string[]; goods: string[] };

/**
 * Structured 신간(new books) · 굿즈(goods) pulled from the booth's blurb by AI,
 * shown as chip sections in the 소개 tab. Lazy + server-cached (shares the booth
 * summary call). While the AI call is in flight it shows a labelled skeleton —
 * the call can exceed 0.5s, so the section never appears as a blank gap.
 */
export function BoothHighlights({
  boothId,
  hideGoods = false,
}: {
  boothId: string;
  /** Manual enrichment already shows 굿즈 → hide the AI-extracted goods to avoid a duplicate section. */
  hideGoods?: boolean;
}) {
  const [data, setData] = useState<Extract | null>(null);
  const [loading, setLoading] = useState(true);
  const goodsMsg = useRotatingMessage(LOADING_MESSAGES.goods, loading);

  // Reset to the loading state when the booth changes, during render (not in an
  // effect) to avoid a cascading setState-in-effect. The effect below only kicks
  // off the fetch and writes results via async callbacks.
  const [reqKey, setReqKey] = useState(boothId);
  if (reqKey !== boothId) {
    setReqKey(boothId);
    setData(null);
    setLoading(true);
  }

  useEffect(() => {
    let cancelled = false;
    api
      .post<Extract>("/api/ai/booth-summary", { boothId })
      .then((r) => {
        if (!cancelled) setData(r);
      })
      .catch(() => {
        if (!cancelled) setData(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [boothId]);

  const newReleases = data?.newReleases ?? [];
  const goods = hideGoods ? [] : (data?.goods ?? []);

  if (loading) {
    return (
      <section className="space-y-2" role="status" aria-live="polite">
        <h2 className="flex items-center gap-1.5 text-base font-bold">
          <Gift className="size-4 text-primary" aria-hidden /> 신간·굿즈
        </h2>
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="flex size-7 shrink-0 items-center justify-center overflow-hidden">
            <RoamMotion pool={THINKING_POOL} />
          </span>
          {goodsMsg}…
        </p>
        <div className="flex flex-wrap gap-1.5" aria-hidden>
          {[64, 88, 52, 72, 60].map((w, i) => (
            <span
              key={i}
              className="h-7 animate-pulse rounded-full bg-secondary"
              style={{ width: w }}
            />
          ))}
        </div>
      </section>
    );
  }

  if (newReleases.length === 0 && goods.length === 0) return null;

  return (
    <>
      {newReleases.length > 0 && (
        <section className="space-y-2">
          <h2 className="flex items-center gap-1.5 text-base font-bold">
            <BookOpen className="size-4 text-primary" aria-hidden /> 신간·전시
          </h2>
          <div className="flex flex-wrap gap-1.5">
            {newReleases.map((k) => (
              <span
                key={k}
                className="rounded-full border border-border bg-card px-2.5 py-1 text-sm font-medium text-foreground/90"
              >
                {k}
              </span>
            ))}
          </div>
        </section>
      )}
      {goods.length > 0 && (
        <section className="space-y-2">
          <h2 className="flex items-center gap-1.5 text-base font-bold">
            <Gift className="size-4 text-primary" aria-hidden /> 굿즈
          </h2>
          <div className="flex flex-wrap gap-1.5">
            {goods.map((k) => (
              <span
                key={k}
                className="rounded-full border border-border bg-card px-2.5 py-1 text-sm font-medium text-foreground/90"
              >
                {k}
              </span>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
