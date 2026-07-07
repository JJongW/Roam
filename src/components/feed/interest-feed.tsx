"use client";

import { Sparkles } from "lucide-react";
import { api } from "@/lib/api/client";
import { BoothCard } from "@/components/booth/booth-card";
import type { Booth, Category } from "@/lib/types";

/**
 * 관심 피드 — L4 브레인으로 큐레이션한 부스를 사전 노출한다(정보 전달기→발견 동행자).
 * 카드 클릭은 부스 상세로 이동(BoothCard의 Link)하면서 관심 신호를 적재해 브레인에
 * 피드백한다("관심 누적 → 학습도"). companion-reframe §5-b.
 */
export function InterestFeed({
  booths,
  categoryById,
}: {
  booths: Booth[];
  categoryById: Record<string, Category>;
}) {
  if (booths.length === 0) return null;

  function fire(boothId: string) {
    // fire-and-forget — 이동을 막지 않는다.
    void api.post("/api/me/signal", { boothId, kind: "feed_click" }).catch(() => {});
  }

  return (
    <section className="mt-6">
      <div className="mb-2 flex items-center gap-2 px-1">
        <Sparkles className="size-4 text-primary" aria-hidden />
        <h2 className="text-base font-bold">관심 가는 부스</h2>
      </div>
      <p className="mb-3 px-1 text-sm text-muted-foreground">
        둘러볼수록 더 잘 맞춰줄게.
      </p>
      <div className="space-y-2">
        {booths.map((b) => (
          <div key={b.id} onClick={() => fire(b.id)}>
            <BoothCard booth={b} category={categoryById[b.categoryId]} />
          </div>
        ))}
      </div>
    </section>
  );
}
