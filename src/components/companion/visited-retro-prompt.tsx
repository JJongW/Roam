"use client";

import { useEffect, useState } from "react";
import { Heart, X } from "lucide-react";
import { api } from "@/lib/api/client";
import { useVisitStore, pushRetro } from "@/lib/stores/visit";
import { useT } from "@/lib/i18n/provider";

interface PendingBooth {
  boothId: string;
  boothName: string;
}

/**
 * 관람 마치기에서, '가봄'인데 아직 "여기 어땠어?"에 답 안 한 부스를 몇 개 묶어
 * 한 번에 되묻는다. 부스 수가 많은 전시에서 하나씩 지도로 되묻는 건 비현실적이라
 * 여기서 한 번에 처리한다. 답한 부스는 목록에서 바로 빠진다. 전부 답하거나
 * 건너뛰면 onDone()을 불러 기존 회고 흐름으로 넘어간다. 대상이 없으면 아무것도
 * 렌더하지 않고 즉시 onDone()을 부른다(부모가 렌더 중 호출해도 안전하도록 effect로).
 */
export function VisitedRetroPrompt({
  exhibitionSlug,
  onDone,
}: {
  exhibitionSlug: string;
  onDone: () => void;
}) {
  const t = useT();
  const setRetro = useVisitStore((s) => s.setRetro);
  const [pending, setPending] = useState<PendingBooth[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get<{ pending: PendingBooth[] }>(
        `/api/me/notes/pending-retro?exhibitionSlug=${encodeURIComponent(exhibitionSlug)}`,
      )
      .then((r) => {
        if (!cancelled) setPending(r.pending);
      })
      .catch(() => {
        if (!cancelled) setPending([]);
      });
    return () => {
      cancelled = true;
    };
  }, [exhibitionSlug]);

  useEffect(() => {
    if (pending !== null && pending.length === 0) onDone();
  }, [pending, onDone]);

  function answer(boothId: string, liked: boolean) {
    setPending((prev) => (prev ? prev.filter((b) => b.boothId !== boothId) : prev));
    setRetro(boothId, liked ? "liked" : "disliked");
    void pushRetro(boothId, liked);
  }

  if (!pending || pending.length === 0) return null;

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
      <p className="text-sm font-bold">{t("companion.retroBatchTitle")}</p>
      <ul className="space-y-2">
        {pending.map((b) => (
          <li
            key={b.boothId}
            className="flex items-center justify-between gap-2 rounded-xl border border-border px-3 py-2"
          >
            <span className="truncate text-sm font-semibold">{b.boothName}</span>
            <div className="flex shrink-0 gap-1.5">
              <button
                type="button"
                aria-label={t("reaction.interested")}
                onClick={() => answer(b.boothId, true)}
                className="flex size-8 items-center justify-center rounded-lg border border-border active:bg-accent/40"
              >
                <Heart className="size-4" aria-hidden />
              </button>
              <button
                type="button"
                aria-label={t("reaction.skip")}
                onClick={() => answer(b.boothId, false)}
                className="flex size-8 items-center justify-center rounded-lg border border-border active:bg-accent/40"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={onDone}
        className="w-full text-center text-xs font-semibold text-muted-foreground active:opacity-70"
      >
        {t("companion.retroBatchSkip")}
      </button>
    </div>
  );
}
