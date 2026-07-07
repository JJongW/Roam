"use client";

import { useState } from "react";
import { ChevronDown, Sparkles } from "lucide-react";
import { api } from "@/lib/api/client";
import { BoothCard } from "@/components/booth/booth-card";
import { cn } from "@/lib/utils";
import type { Category } from "@/lib/types";
import type { FeedItem } from "@/lib/feed/curate";

/**
 * 관심 피드 — L4 브레인으로 큐레이션한 부스를 사전 노출한다(정보 전달기→발견 동행자).
 * 카드는 부스 상세로 이동, "비슷한 부스"를 펼치면 관련 부스가 스레드처럼 인라인 확장된다
 * (companion-reframe §5-b). 클릭·펼치기가 관심 신호로 브레인에 피드백된다.
 */
export function InterestFeed({
  items,
  categoryById,
}: {
  items: FeedItem[];
  categoryById: Record<string, Category>;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  if (items.length === 0) return null;

  function fire(boothId: string) {
    // fire-and-forget — 이동을 막지 않는다.
    void api.post("/api/me/signal", { boothId, kind: "feed_click" }).catch(() => {});
  }
  function toggle(boothId: string) {
    fire(boothId); // 관련 펼치기 = 관심 신호
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(boothId)) next.delete(boothId);
      else next.add(boothId);
      return next;
    });
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
        {items.map(({ booth, related }) => {
          const open = expanded.has(booth.id);
          return (
            <div key={booth.id}>
              <div onClick={() => fire(booth.id)}>
                <BoothCard
                  booth={booth}
                  category={categoryById[booth.categoryId]}
                />
              </div>
              {related.length > 0 && (
                <>
                  <button
                    type="button"
                    onClick={() => toggle(booth.id)}
                    aria-expanded={open}
                    className="mt-1 flex items-center gap-1 px-2 py-1 text-xs font-semibold text-muted-foreground active:opacity-70"
                  >
                    <ChevronDown
                      className={cn(
                        "size-3.5 transition-transform",
                        open && "rotate-180",
                      )}
                      aria-hidden
                    />
                    비슷한 부스 {related.length}
                  </button>
                  {open && (
                    <div className="ml-3 mt-1 space-y-1.5 border-l-2 border-primary/20 pl-3">
                      {related.map((rb) => (
                        <div key={rb.id} onClick={() => fire(rb.id)}>
                          <BoothCard
                            booth={rb}
                            category={categoryById[rb.categoryId]}
                            compact
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
