"use client";

import { useState } from "react";
import Image from "next/image";
import { ChevronDown, Clock3 } from "lucide-react";
import { api } from "@/lib/api/client";
import { BoothCard } from "@/components/booth/booth-card";
import { ValueChips } from "@/components/values/value-chips";
import { GroundingCard } from "@/components/feed/grounding-card";
import { ReactionBar } from "@/components/feed/reaction-bar";
import { useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";
import type { Category } from "@/lib/types";
import type { FeedItem, PickKind } from "@/lib/feed/curate";

/**
 * 관심 피드 — Instagram Threads 앱형 세로 스레드 피드. 각 항목은 Roam이 건네는 "게시물":
 * 아바타 + 발화(왜 골랐는지) + 인용된 부스 카드 + 가치칩·실시간 큐·반응. 관련 부스는
 * 스레드의 "답글"처럼 아바타 컬럼 아래로 이어지는 세로선에 물려 인라인 확장된다
 * (companion-reframe §5-b). 클릭·펼치기가 관심 신호로 브레인에 피드백된다. 로직 무변경.
 */
export function InterestFeed({
  items,
  categoryById,
  memoryLine,
}: {
  items: FeedItem[];
  categoryById: Record<string, Category>;
  /** 기억 발화 — 브레인 상위 관심 기반 인사. 없으면 기본 문구. */
  memoryLine?: string;
}) {
  const t = useT();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  if (items.length === 0) return null;

  function fire(boothId: string) {
    // fire-and-forget — 이동을 막지 않는다.
    void api
      .post("/api/me/signal", { boothId, kind: "feed_click" })
      .catch(() => {});
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
      <div className="mb-1 px-1">
        <h2 className="text-base font-bold">{t("feed.heading")}</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {memoryLine ?? t("feed.subFallback")}
        </p>
      </div>

      <div>
        {items.map(({ booth, related, pick, cue, grounding }) => {
          const open = expanded.has(booth.id);
          return (
            <article
              key={booth.id}
              className="flex gap-3 border-b border-border/60 py-4 last:border-b-0"
            >
              {/* 아바타 컬럼 + 스레드 세로선 */}
              <div className="flex flex-col items-center">
                <RoamAvatar />
                {(related.length > 0 && open) || cue ? (
                  <span className="mt-1 w-px flex-1 bg-border" aria-hidden />
                ) : null}
              </div>

              {/* 게시물 본문 */}
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-sm font-bold">{t("romi.name")}</span>
                  <span className="text-xs text-muted-foreground">
                    · {t(PICK_KEY[pick])}
                  </span>
                </div>

                <div className="mt-2" onClick={() => fire(booth.id)}>
                  <BoothCard
                    booth={booth}
                    category={categoryById[booth.categoryId]}
                  />
                </div>

                {booth.valueTags && booth.valueTags.length > 0 && (
                  <div className="mt-2">
                    <ValueChips tags={booth.valueTags} />
                  </div>
                )}

                <GroundingCard grounding={grounding} />

                {cue && (
                  <div className="mt-2 flex items-start gap-1.5 text-xs leading-relaxed text-muted-foreground">
                    <Clock3 className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                    <span>{cue}</span>
                  </div>
                )}

                <div className="mt-2.5">
                  <ReactionBar boothId={booth.id} />
                </div>

                {related.length > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={() => toggle(booth.id)}
                      aria-expanded={open}
                      className="mt-2 flex items-center gap-1 py-1 text-xs font-semibold text-muted-foreground active:opacity-70"
                    >
                      <ChevronDown
                        className={cn(
                          "size-3.5 transition-transform",
                          open && "rotate-180",
                        )}
                        aria-hidden
                      />
                      {open
                        ? t("feed.collapse")
                        : t("feed.similar", { n: related.length })}
                    </button>

                    {open && (
                      <div className="mt-2 space-y-2">
                        {related.map((rb) => (
                          <div key={rb.id} className="flex gap-2.5">
                            <RoamAvatar small />
                            <div
                              className="min-w-0 flex-1"
                              onClick={() => fire(rb.id)}
                            >
                              <BoothCard
                                booth={rb}
                                category={categoryById[rb.categoryId]}
                                compact
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

/** 스레드 게시자 = Roam. 로고 아바타. */
function RoamAvatar({ small = false }: { small?: boolean }) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-full ring-1 ring-border",
        small ? "size-7" : "size-9",
      )}
    >
      <Image
        src="/logo.svg"
        alt="Roam"
        width={small ? 28 : 36}
        height={small ? 28 : 36}
        className="size-full object-cover"
        unoptimized
      />
    </span>
  );
}

/** pick 갈래 → 사전 키(로미의 발화 한 조각). */
const PICK_KEY: Record<PickKind, string> = {
  stable: "feed.pickStable",
  unfamiliar: "feed.pickUnfamiliar",
  adventure: "feed.pickAdventure",
};
