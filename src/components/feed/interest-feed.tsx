"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronDown, ChevronRight, Clock3, Lightbulb } from "lucide-react";
import { api } from "@/lib/api/client";
import { ValueChips } from "@/components/values/value-chips";
import { CategoryChip } from "@/components/booth/category-chip";
import { ReactionBar } from "@/components/feed/reaction-bar";
import { useT } from "@/lib/i18n/provider";
import type { TFn } from "@/lib/i18n/resolve";
import { cn } from "@/lib/utils";
import { VALUE_SLUGS } from "@/lib/values";
import type { Booth, Category } from "@/lib/types";
import type { FeedItem, PickKind } from "@/lib/feed/curate";

/**
 * 관심 피드 — Roam이 건네는 추천을 항목별로 **하나의 카드 단위**로 묶는다. 각 카드는
 * 같은 형태: [로미 발화(왜 골랐는지) → 부스 → 근거·큐 → 반응 → 관련]. 예전엔 부스 카드·
 * 근거 카드·칩이 따로 떠 흩어져 보였는데, 한 카드 안에 seam 없이 담아 일관되게 읽히게 함.
 * 클릭·펼치기가 관심 신호로 브레인에 피드백된다(로직 무변경).
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
    void api
      .post("/api/me/signal", { boothId, kind: "feed_click" })
      .catch(() => {});
  }
  function toggle(boothId: string) {
    fire(boothId);
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(boothId)) next.delete(boothId);
      else next.add(boothId);
      return next;
    });
  }

  return (
    <section className="mt-6">
      <div className="mb-2 px-1">
        <h2 className="text-base font-bold">{t("feed.heading")}</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {memoryLine ?? t("feed.subFallback")}
        </p>
      </div>

      <div className="space-y-3">
        {items.map(({ booth, related, pick, cue, grounding }) => {
          const open = expanded.has(booth.id);
          return (
            <article
              key={booth.id}
              className="overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-card)]"
            >
              {/* 1) 로미 발화 — 왜 골랐는지(카드의 머리) */}
              <div className="flex items-start gap-2.5 px-4 pt-3.5">
                <RoamAvatar />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-sm font-bold">{t("romi.name")}</span>
                    <span className="text-xs text-muted-foreground">
                      · {t(PICK_KEY[pick])}
                    </span>
                  </div>
                  <p className="mt-1 flex items-start gap-1.5 text-sm font-medium leading-relaxed text-foreground/90">
                    <Lightbulb
                      className="mt-0.5 size-3.5 shrink-0 text-primary"
                      aria-hidden
                    />
                    <span>{grounding.why}</span>
                  </p>
                </div>
              </div>

              {/* 2) 부스 아이덴티티 — 카드에 seam 없이 인라인(카드-인-카드 아님) */}
              <Link
                href={`/booths/${booth.id}`}
                onClick={() => fire(booth.id)}
                className="mt-3 flex items-center gap-3 px-4 py-2.5 active:bg-accent/40"
              >
                <BoothThumb
                  booth={booth}
                  category={categoryById[booth.categoryId]}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold">{booth.name}</p>
                  <p className="truncate text-sm text-muted-foreground">
                    {booth.company}
                  </p>
                </div>
                <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
              </Link>

              {/* 3) 태그·근거·큐 — 같은 카드 안 얇은 구분선으로 묶음 */}
              <div className="space-y-2 border-t border-border/60 px-4 py-2.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  {categoryById[booth.categoryId] && (
                    <CategoryChip category={categoryById[booth.categoryId]} />
                  )}
                  {booth.valueTags && booth.valueTags.length > 0 && (
                    <ValueChips tags={booth.valueTags} />
                  )}
                </div>

                {grounding.evidence.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {grounding.evidence.map((ev, i) => (
                      <span
                        key={i}
                        className="rounded-md bg-secondary px-1.5 py-0.5 text-xs text-muted-foreground"
                      >
                        {ev}
                      </span>
                    ))}
                  </div>
                )}

                {grounding.todo.length > 0 && (
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {t("grounding.todo", { items: grounding.todo.join(" · ") })}
                  </p>
                )}

                {cue && (
                  <p className="flex items-start gap-1.5 text-xs leading-relaxed text-muted-foreground">
                    <Clock3 className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                    <span>{cue}</span>
                  </p>
                )}

                <div className="flex items-center gap-1.5">
                  <span
                    className={cn(
                      "size-1.5 rounded-full",
                      CONF_DOT[grounding.confidence],
                    )}
                    aria-hidden
                  />
                  <span className="text-[11px] text-muted-foreground">
                    {t(CONF_KEY[grounding.confidence])}
                  </span>
                </div>
              </div>

              {/* 4) 반응 */}
              <div className="border-t border-border/60 px-4 py-2.5">
                <ReactionBar
                  boothId={booth.id}
                  valueLabel={leadValueLabel(booth, t)}
                />
              </div>

              {/* 5) 관련 부스 — 같은 카드 하단으로 인라인 확장 */}
              {related.length > 0 && (
                <div className="border-t border-border/60 px-4 py-2">
                  <button
                    type="button"
                    onClick={() => toggle(booth.id)}
                    aria-expanded={open}
                    className="flex items-center gap-1 py-1 text-xs font-semibold text-muted-foreground active:opacity-70"
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
                    <div className="mt-1 space-y-1">
                      {related.map((rb) => (
                        <Link
                          key={rb.id}
                          href={`/booths/${rb.id}`}
                          onClick={() => fire(rb.id)}
                          className="flex items-center gap-2.5 rounded-xl px-1 py-2 active:bg-accent/40"
                        >
                          <BoothThumb
                            booth={rb}
                            category={categoryById[rb.categoryId]}
                            small
                          />
                          <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                            {rb.name}
                          </span>
                          <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

/** 부스 썸네일 — 작품/로고 있으면 이미지, 없으면 카테고리색 이니셜. 피드·관련 공통. */
function BoothThumb({
  booth,
  category,
  small = false,
}: {
  booth: Booth;
  category?: Category;
  small?: boolean;
}) {
  const thumb = booth.images?.[0] ?? booth.logoUrl;
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-xl",
        small ? "size-9" : "size-11",
      )}
      style={{
        backgroundColor: category ? `${category.color}1a` : "var(--secondary)",
      }}
    >
      {thumb ? (
        // eslint-disable-next-line @next/next/no-img-element -- 외부 CDN 이미지
        <img
          src={thumb}
          alt=""
          loading="lazy"
          className="size-full object-cover"
        />
      ) : (
        <span
          className="text-base font-bold"
          style={{ color: category?.color }}
        >
          {booth.name.slice(0, 1)}
        </span>
      )}
    </span>
  );
}

/** 스레드 게시자 = Roam. 로고 아바타. */
function RoamAvatar() {
  return (
    <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full ring-1 ring-border">
      <Image
        src="/logo.svg"
        alt="Roam"
        width={36}
        height={36}
        className="size-full object-cover"
        unoptimized
      />
    </span>
  );
}

/** 부스의 대표 관심 가치 라벨 — 가장 강한 valueTag가 가치 슬러그면 번역해 반환. */
function leadValueLabel(booth: Booth, t: TFn): string | undefined {
  const top = [...(booth.valueTags ?? [])]
    .filter((v) => VALUE_SLUGS.includes(v.slug))
    .sort((a, b) => b.strength - a.strength)[0];
  return top ? t(`values.${top.slug}`) : undefined;
}

const PICK_KEY: Record<PickKind, string> = {
  stable: "feed.pickStable",
  unfamiliar: "feed.pickUnfamiliar",
  adventure: "feed.pickAdventure",
};
const CONF_KEY = {
  high: "grounding.confHigh",
  medium: "grounding.confMedium",
  low: "grounding.confLow",
} as const;
const CONF_DOT = {
  high: "bg-primary",
  medium: "bg-primary/50",
  low: "bg-muted-foreground/40",
} as const;
