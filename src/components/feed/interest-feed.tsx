"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCompanionStore } from "@/lib/stores/companion";
import {
  ChevronDown,
  ChevronRight,
  Clock3,
  Lightbulb,
  RefreshCw,
} from "lucide-react";
import { api } from "@/lib/api/client";
import { ValueChips } from "@/components/values/value-chips";
import { CategoryChip } from "@/components/booth/category-chip";
import { ThemeChip } from "@/components/booth/theme-chip";
import { JudgmentBar } from "@/components/booth/judgment-bar";
import { boothValueSlugs } from "@/lib/values";
import { useT } from "@/lib/i18n/provider";
import { useVisitStore } from "@/lib/stores/visit";
import { useHydrated } from "@/lib/hooks/use-hydrated";
import { cn } from "@/lib/utils";
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
  slug,
}: {
  items: FeedItem[];
  categoryById: Record<string, Category>;
  /** 기억 발화 — 브레인 상위 관심 기반 인사. 없으면 기본 문구. */
  memoryLine?: string;
  /** 반응 시 "저장 안 됨" 안내를 전시당 1회로 제한하는 데 쓴다(JudgmentBar). */
  slug: string;
}) {
  const t = useT();
  const router = useRouter();
  const say = useCompanionStore((s) => s.say);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // router.refresh()는 완료 콜백이 없다 — 수동 boolean은 끄는 코드가 없으면
  // 그대로 눌어붙는다(리페치가 새 items prop으로 들어와도 같은 컴포넌트
  // 인스턴스가 유지돼 리마운트가 안 일어나기 때문). useTransition의 isPending은
  // 감싼 갱신이 실제로 반영될 때 자동으로 꺼진다.
  const [repicking, startRepick] = useTransition();
  // 반응한 카드는 즉시 사라진다 — 서버를 기다리면 "눌러도 안 바뀐다"고 느낀다.
  // 낙관적으로 걷어내고, 아래 새로 고르기를 누를 때 서버 목록이 진실이 된다
  // (curate.ts도 상태 있는 부스를 제외한다). 피드는 6칸짜리 결정 큐다.
  const records = useVisitStore((s) => s.records);
  const hydrated = useHydrated();
  const visible = hydrated
    ? items.filter(
        ({ booth }) =>
          !records[booth.id]?.interest && !records[booth.id]?.verdict,
      )
    : items;

  // 재큐레이션이 와도 이미 보고 있던 카드는 자리를 지키고, 새로 고른 것만 아래에
  // 따로 붙인다. 서버는 매번 랭킹대로 새 목록을 주므로, 그대로 그리면 사라진 카드
  // 자리에 낯선 부스가 슬쩍 끼워 넣어져 무엇이 새 추천인지 알 수 없었다.
  // 위가 아니라 아래에 붙이는 이유: 방금 버튼을 누른 손가락 아래에서 목록이 밀려
  // 올라가면 안 된다.
  // 구분선 위치까지 **상태에 같이** 넣는다. 렌더 중 setState는 즉시 다시 렌더하는데,
  // 그때는 새 id들이 이미 seen에 들어가 있어 "새로 온 것"이 없어진다 — 위치를 매번
  // 다시 계산하면 구분선이 버려지는 렌더에만 잠깐 존재하고 화면엔 절대 안 나온다.
  const [seen, setSeen] = useState<{ ids: string[]; freshFrom: number }>({
    ids: [],
    freshFrom: -1,
  });
  const ids = visible.map((v) => v.booth.id);
  const known = seen.ids.filter((id) => ids.includes(id));
  const fresh = ids.filter((id) => !seen.ids.includes(id));
  const nextIds = [...known, ...fresh];
  // 첫 페인트는 전부 '새 카드'라 구분선이 의미가 없다 — 두 번째부터만 가른다.
  const nextFreshFrom =
    known.length > 0 && fresh.length > 0 ? known.length : -1;
  const changed = nextIds.join() !== seen.ids.join();
  if (changed) setSeen({ ids: nextIds, freshFrom: nextFreshFrom });
  const freshFrom = changed ? nextFreshFrom : seen.freshFrom;
  const byId = new Map(visible.map((v) => [v.booth.id, v]));
  const ordered = nextIds.map((id) => byId.get(id)!);

  // 새로 고르기는 **사용자가 부를 때만**, 그리고 목록 맨 아래에서. 예전엔 반응할
  // 때마다 1.2초 뒤 자동으로 전체 라우트를 새로고침해서, 읽고 있는 도중에 화면 위쪽이
  // 다시 그려지고 목록이 움직였다. 스크롤을 되돌리지 않으려면 새 내용은 아래에서만
  // 자라야 한다 — 버튼도 아래 두고, 누르기 전엔 아무것도 안 움직인다.
  function repick() {
    say(t("companion.recurated"));
    startRepick(() => {
      router.refresh();
    });
  }

  // 배치(최대 6칸)를 다 정리했는데 서버가 더 줄 게 있을 수도 있으면 자동으로
  // 채운다 — 이건 "반응할 때마다" 자동 새로고침하던 예전 방식과 다르다(그건
  // 읽는 도중에 화면이 다시 그려져서 걷어냈다, repick() 주석 참고). 여기는
  // **큐가 완전히 비었을 때만** 한 번 트리거되므로 읽던 카드가 움직이는 일이
  // 없다 — 이미 6칸 다 판단해서 화면에 볼 게 없는 순간이기 때문이다.
  // items 내용(id 집합)이 바뀌기 전까지는 다시 트리거하지 않는다 — 서버가
  // 정말 아무것도 못 줘서 items가 그대로 돌아와도 무한 재시도하지 않기 위함.
  const autoRefreshedForRef = useRef<string>("");
  useEffect(() => {
    if (visible.length !== 0 || items.length === 0 || repicking) return;
    const key = items
      .map((i) => i.booth.id)
      .sort()
      .join(",");
    if (autoRefreshedForRef.current === key) return;
    autoRefreshedForRef.current = key;
    startRepick(() => {
      router.refresh();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible.length, items, repicking]);

  if (visible.length === 0) {
    // 서버가 이번에 준 items 자체가 비었으면(자동 재시도로도 더 안 나옴) 이
    // 전시엔 정말 더 볼 부스가 없는 것 — "다시 골라줘"를 반복해봐야 소용없으니
    // 지도로 안내한다. items는 있는데 방금 다 판단해 visible만 0이면 위 effect가
    // 자동으로 다시 채우는 중 — 그 짧은 순간만 로딩으로 보여준다.
    const exhausted = items.length === 0;
    return (
      <section className="mt-6">
        <div className="mb-2 px-1">
          <h2 className="text-base font-bold">{t("feed.heading")}</h2>
        </div>
        <div className="rounded-2xl border border-dashed border-border px-4 py-6 text-center">
          {exhausted ? (
            <>
              <p className="text-sm text-muted-foreground">
                {t("feed.exhausted")}
              </p>
              {/* 마치기 버튼(FinishVisit)은 이 화면 아래 이미 렌더돼 있다(판단이
                  하나라도 있으면 뜬다 — 피드 소진 상태면 항상 그렇다). 로직을
                  중복 구현하지 않고 그 버튼으로 스크롤만 시킨다. */}
              <div className="mt-3 flex items-center justify-center gap-2">
                <a
                  href="#finish-visit-button"
                  onClick={() => trackClick("feed_exhausted_finish")}
                  className="inline-flex min-h-11 items-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground active:opacity-80"
                >
                  {t("feed.exhaustedFinishCta")}
                </a>
                <Link
                  href={`/exhibitions/${slug}/map`}
                  onClick={() => trackClick("feed_exhausted_map")}
                  className="inline-flex min-h-11 items-center rounded-xl border border-border px-4 text-sm font-semibold active:bg-accent/40"
                >
                  {t("feed.exhaustedMapCta")}
                </Link>
              </div>
            </>
          ) : (
            <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <RefreshCw className="size-4 animate-spin" />
              {t("feed.repicking")}
            </p>
          )}
        </div>
      </section>
    );
  }

  function fire(boothId: string) {
    void api
      .post("/api/me/signal", { boothId, kind: "feed_click" })
      .catch(() => {});
  }
  function trackClick(control: string) {
    void fetch("/api/analytics/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "ui_click",
        exhibitionSlug: slug,
        meta: { control },
      }),
    });
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
        {ordered.map(({ booth, related, pick, cue, grounding }, idx) => {
          const open = expanded.has(booth.id);
          return (
            <div key={booth.id} className="space-y-3">
              {idx === freshFrom && (
                <p className="flex items-center gap-2 px-1 pt-1 text-xs font-semibold text-muted-foreground">
                  <span className="h-px flex-1 bg-border" aria-hidden />
                  {t("feed.freshDivider")}
                  <span className="h-px flex-1 bg-border" aria-hidden />
                </p>
              )}
              <article className="overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-card)]">
                {/* 1) 로미 발화 — 왜 골랐는지(카드의 머리) */}
                <div className="flex items-start gap-2.5 px-4 pt-3.5">
                  <RoamAvatar />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-xs font-semibold text-muted-foreground">
                        {t("romi.name")}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        · {t(PICK_KEY[pick])}
                      </span>
                    </div>
                    {/* grounding.why는 부스명 폴백으로 이제 항상 값이 있다 — 이 가드는
                        더는 실제로 갈리지 않는 방어 코드다(grounding.ts). */}
                    {grounding.why && (
                      <p className="mt-1 flex items-start gap-1.5 text-sm font-medium leading-relaxed text-foreground/90">
                        <Lightbulb
                          className="mt-0.5 size-3.5 shrink-0 text-primary"
                          aria-hidden
                        />
                        <span>{grounding.why}</span>
                      </p>
                    )}
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
                    {/* 부스 번호 — 현장에선 이름보다 번호로 찾는다. 지도 팝업과 같은 형태. */}
                    <p className="truncate text-[17px] font-extrabold tracking-tight">
                      {booth.name}
                      {booth.code && (
                        <span className="ml-1.5 text-xs font-semibold text-muted-foreground">
                          {booth.code}
                        </span>
                      )}
                    </p>
                    <p className="truncate text-sm text-muted-foreground">
                      {booth.company}
                    </p>
                  </div>
                  <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
                </Link>

                {/* 3) 태그·근거·큐 — 같은 카드 안 얇은 구분선으로 묶음 */}
                <div className="space-y-2 border-t border-border/60 px-4 py-2.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {/* 테마(무엇을 그리는가)를 먼저 — 취향이 붙는 축이다. */}
                    <ThemeChip tags={booth.tags} />
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
                      {t("grounding.todo", {
                        items: grounding.todo.join(" · "),
                      })}
                    </p>
                  )}

                  {cue && (
                    <p className="flex items-start gap-1.5 text-xs leading-relaxed text-muted-foreground">
                      <Clock3
                        className="mt-0.5 size-3.5 shrink-0"
                        aria-hidden
                      />
                      <span>{cue}</span>
                    </p>
                  )}
                </div>

                {/* 4) 반응 — 피드는 관람 전이니 정도(interest)만 묻는다. */}
                <div className="border-t border-border/60 px-4 py-2.5">
                  <JudgmentBar
                    mode="interest"
                    boothId={booth.id}
                    boothName={booth.name}
                    interestSlugs={boothValueSlugs(booth)}
                    categoryLabel={categoryById[booth.categoryId]?.name}
                    exhibitionSlug={slug}
                  />
                </div>

                {/* 5) 관련 부스 — 같은 카드 하단으로 인라인 확장 */}
                {related.length > 0 && (
                  <div className="border-t border-border/60 px-4">
                    {/* 행 전체가 손가락 과녁이다 — 아이콘+글자 폭만 눌리던 걸 넓혔다.
                      높이 44px는 손끝으로 정확히 겨눌 수 있는 최소치(HIG). */}
                    <button
                      type="button"
                      onClick={() => toggle(booth.id)}
                      aria-expanded={open}
                      className="-mx-4 flex min-h-11 w-[calc(100%+2rem)] items-center justify-between gap-1 px-4 text-xs font-semibold text-muted-foreground active:bg-accent/40"
                    >
                      {open
                        ? t("feed.collapse")
                        : t("feed.similar", { n: related.length })}
                      <ChevronDown
                        className={cn(
                          "size-4 shrink-0 transition-transform",
                          open && "rotate-180",
                        )}
                        aria-hidden
                      />
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
            </div>
          );
        })}

        {/* 목록의 끝 — 새로 고르기는 여기서만 일어난다(위에서 자동으로 바뀌지 않는다). */}
        <button
          type="button"
          onClick={() => {
            trackClick("feed_repick");
            repick();
          }}
          disabled={repicking}
          className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-2xl border border-dashed border-border text-sm font-semibold text-muted-foreground active:bg-accent/40 disabled:opacity-60"
        >
          <RefreshCw
            className={cn("size-4", repicking && "animate-spin")}
            aria-hidden
          />
          {repicking ? t("feed.repicking") : t("feed.repick")}
        </button>
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

const PICK_KEY: Record<PickKind, string> = {
  stable: "feed.pickStable",
  unfamiliar: "feed.pickUnfamiliar",
  adventure: "feed.pickAdventure",
};
