"use client";

import { useEffect, useState } from "react";
import { BookOpen, Gift } from "lucide-react";
import { api } from "@/lib/api/client";

type Extract = { summary: string; newReleases: string[]; goods: string[] };

/**
 * Structured 신간(new books) · 굿즈(goods) pulled from the booth's blurb by AI,
 * shown as chip sections in the 소개 tab. Lazy + server-cached (shares the booth
 * summary call). Renders nothing when AI is off or there's nothing to show.
 */
export function BoothHighlights({ boothId }: { boothId: string }) {
  const [data, setData] = useState<Extract | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .post<Extract>("/api/ai/booth-summary", { boothId })
      .then((r) => {
        if (!cancelled) setData(r);
      })
      .catch(() => {
        if (!cancelled) setData(null);
      });
    return () => {
      cancelled = true;
    };
  }, [boothId]);

  const newReleases = data?.newReleases ?? [];
  const goods = data?.goods ?? [];
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
