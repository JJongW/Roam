"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { clsx } from "clsx";
import { BackButton } from "@/components/v2/back-button";
import { HeartButton } from "@/components/v2/heart-button";
import { RomiAvatar } from "@/components/v2/romi-avatar";
import { Snackbar, type SnackbarState } from "@/components/v2/snackbar";
import { takeLoginPrompt } from "@/components/booth-v2/booth-actions";
import { useHydrated } from "@/lib/hooks/use-hydrated";
import { isHearted, pushNote, useVisitStore } from "@/lib/stores/visit";
import { useAuthStore } from "@/lib/stores/auth";
import { label, romi, system } from "@/lib/copy/v1";
import { entryCopy } from "@/lib/copy/map-entry";
import {
  morePicks,
  readFairState,
  updateFairState,
  type FirstPick,
} from "@/lib/onboarding/fair-entry";
import { SCREEN, track } from "@/lib/analytics/app-track";
import {
  byBoothNumber,
  groupByCategory,
  hallsInOrder,
  type ListBooth,
} from "@/lib/browse/booth-list";

const HEARTS = "hearts";

/**
 * UI 8-01 부스 목록, 분류 먼저(Figma 3003:15934), 8-02 분류 속 부스 목록(3003:16040),
 * 8-03 하트 없을 때(3003:16154). L-B(11-11)와 하트 0이면 그 줄을 빼는 규칙(11-12).
 *
 * - 맨 위 "하트 남긴 곳"은 하트가 있을 때만. "0곳"이라고 세지 않는다(8-03).
 * - 줄을 누르면 지도에서 그 부스 카드가 열린다(8-02 → 5-01). 줄의 하트는 바로 누를 수 있고,
 *   빼기는 지도 카드와 같은 스낵바 되돌리기(5-08), 첫 하트는 로그인 제안(5-02)을 한 번 띄운다.
 * - 8-04 로미가 골라 봤어요(K-C): 이 박람회 첫 진입(UI 1)에서 사진을 고르셨으면 맨 위 로미 상자 대신
 *   고른 곳 세 줄(더 보기로 열 줄). 이유는 확인된 것만(고르신 사진의 부스, 같은 분류). 사진을 건너뛰셨으면 없다
 *   (설계서 8-04 "건너뛰었으면 R-2 없음"). 지도에는 올리지 않는다. 지도에 켜기는 지도 로미 줄(8-06)에서.
 */
export function BoothListScreen({
  slug,
  booths,
  categories,
  hallOrder,
  category,
}: {
  slug: string;
  booths: ListBooth[];
  categories: { id: string; name: string }[];
  hallOrder: string[];
  /** `?c=` 분류 id, "hearts", 또는 없음(8-01) */
  category?: string;
}) {
  const hydrated = useHydrated();
  const records = useVisitStore((s) => s.records);
  const listHref = `/exhibitions/${slug}/booths`;
  const mapHref = `/exhibitions/${slug}/map`;

  const groups = useMemo(
    () => groupByCategory(booths, categories, label.otherCategory),
    [booths, categories],
  );
  const hearted = useMemo(
    () =>
      hydrated
        ? booths.filter((b) => isHearted(records[b.id])).sort(byBoothNumber)
        : [],
    [booths, records, hydrated],
  );

  // 하트 줄은 처음 열 때의 하트로 고정한다. 목록에서 하트를 빼자마자 줄이 사라지면 되돌리기를 누를 곳이 없다.
  const [heartIds, setHeartIds] = useState<string[] | null>(null);
  // 렌더 중 한 번 맞추기(React "props가 바뀔 때 state 맞추기" 방식). 하이드레이션 뒤 첫 렌더에서 정해진다.
  if (hydrated && category === HEARTS && heartIds === null)
    setHeartIds(hearted.map((b) => b.id));

  const group =
    category === HEARTS
      ? heartIds && heartIds.length > 0
        ? {
            id: HEARTS,
            name: label.heartedPlaces,
            booths: booths
              .filter((b) => heartIds.includes(b.id))
              .sort(byBoothNumber),
          }
        : undefined
      : groups.find((g) => g.id === category);

  useEffect(() => {
    if (!hydrated) return;
    if (group)
      track("screen_view", {
        screen: SCREEN.boothListCategory,
        exhibitionSlug: slug,
        props: { category_id: group.id, count: group.booths.length },
      });
    else
      track("booth_list_open", {
        screen: SCREEN.boothList,
        exhibitionSlug: slug,
        props: { has_hearts: hearted.length > 0, count: booths.length },
      });
    // 화면이 바뀔 때 한 번만 센다(하트를 누를 때마다 세지 않는다).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, group?.id, slug]);

  // 분류를 열려고 했는데(하트 줄이 비었거나 없는 분류) 보여 줄 게 없으면 8-01로 둔다.
  const waiting = category === HEARTS && heartIds === null;

  // 8-04 로미가 고른 곳. 처음 열 때의 하트로 줄을 고정한다(하트를 누르자마자 줄이 사라지면 되돌리기를 누를 곳이 없다).
  // "이건 아니에요"를 누른 줄만 바로 뺀다.
  const [frozenPicks, setFrozenPicks] = useState<FirstPick[] | null>(null);
  const [dismissed, setDismissed] = useState<string[]>([]);
  if (hydrated && !group && frozenPicks === null) {
    const st = readFairState(slug);
    const catName = new Map(categories.map((c) => [c.id, c.name]));
    setFrozenPicks(
      morePicks(
        st.moodBoothIds,
        booths,
        (id) => catName.get(id),
        new Set(hearted.map((b) => b.id)),
        new Set(st.notThis),
      ),
    );
  }
  const picks = (frozenPicks ?? []).filter((p) => !dismissed.includes(p.boothId));
  const picksShown = (frozenPicks?.length ?? 0) > 0;
  useEffect(() => {
    if (!picksShown || !frozenPicks) return;
    track("romi_pick_shown", {
      screen: SCREEN.picksList,
      exhibitionSlug: slug,
      props: { count: frozenPicks.length, from: "booth_list" },
    });
    // 목록을 열 때 한 번
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picksShown]);

  return (
    <div className="min-h-dvh bg-v2-bg-layer-default font-v2-ui text-v2-fg-neutral">
      <div className="mx-auto flex w-full max-w-[var(--roam-v2-size-content-max-width)] flex-col pb-v2-x28">
        <div className="flex items-center justify-between px-v2-x1-5 pt-safe">
          <BackButton fallbackHref={group ? listHref : mapHref} />
          <Link
            href={mapHref}
            className="flex min-h-v2-x9 items-center rounded-v2-r2 px-v2-x3-5 py-v2-x2 text-v2-t4 font-v2-bold text-v2-fg-neutral-muted active:bg-v2-bg-transparent-pressed"
          >
            {label.toMap}
          </Link>
        </div>
        {waiting ? null : group ? (
          <CategoryBooths slug={slug} title={group.name} booths={group.booths} categoryId={group.id} />
        ) : (
          <div className="flex flex-col gap-v2-x3 pb-v2-x6">
            <div className="flex flex-col gap-v2-x3 px-v2-x4">
              <h1 className="text-v2-t7 font-v2-bold tracking-v2-card-title">
                {label.boothList}
              </h1>
              {picks.length > 0 ? (
                <div className="flex items-center gap-v2-x2-5 rounded-v2-r3 bg-v2-bg-neutral-weak p-v2-x3">
                  <RomiAvatar size="md" />
                  <p className="min-w-0 flex-1 text-v2-t4 font-v2-medium">{entryCopy.picksHead}</p>
                  {/* 8-05 답 바꾸기: 웹에서 바꿀 수 있는 답은 1-07 제가 알고 있는 것(고르신 사진, 오늘)이다. */}
                  <Link
                    href={`${mapHref}?romi=known`}
                    onClick={() =>
                      track("romi_row_tap", {
                        screen: SCREEN.picksList,
                        exhibitionSlug: slug,
                        props: { row: "change_answer" },
                      })
                    }
                    className="flex min-h-v2-x9 shrink-0 items-center rounded-v2-r2 px-v2-x2 text-v2-t4 font-v2-bold text-v2-fg-brand active:bg-v2-bg-transparent-pressed"
                  >
                    {entryCopy.changeAnswer}
                  </Link>
                </div>
              ) : (
                <div className="flex items-center gap-v2-x2-5 rounded-v2-r3 bg-v2-bg-neutral-weak p-v2-x3">
                  <RomiAvatar size="md" />
                  <p className="min-w-0 flex-1 whitespace-pre-line text-v2-t4 font-v2-medium">
                    {romi.boothListIntro(hallsInOrder(hallOrder, booths), booths.length)}
                  </p>
                </div>
              )}
            </div>
            {picks.length > 0 && (
              <PicksBlock
                slug={slug}
                picks={picks}
                booths={booths}
                onNotThis={(id) => {
                  updateFairState(slug, (st) => ({ ...st, notThis: [...st.notThis, id] }));
                  setDismissed((d) => [...d, id]);
                  track("romi_pick_feedback", {
                    screen: SCREEN.picksList,
                    exhibitionSlug: slug,
                    boothId: id,
                    props: { choice: "not_this" },
                  });
                }}
              />
            )}
            <ul className="flex flex-col">
              {hearted.length > 0 && (
                <ListRow
                  href={`${listHref}?c=${HEARTS}`}
                  title={label.heartedPlaces}
                  end={label.placesStat(hearted.length)}
                  brand
                  onClick={() =>
                    track("booth_list_category_tap", {
                      screen: SCREEN.boothList,
                      exhibitionSlug: slug,
                      props: { category_id: HEARTS, count: hearted.length },
                    })
                  }
                />
              )}
              {groups.map((g) => (
                <ListRow
                  key={g.id}
                  href={`${listHref}?c=${encodeURIComponent(g.id)}`}
                  title={g.name}
                  end={label.placesStat(g.booths.length)}
                  onClick={() =>
                    track("booth_list_category_tap", {
                      screen: SCREEN.boothList,
                      exhibitionSlug: slug,
                      props: { category_id: g.id, count: g.booths.length },
                    })
                  }
                />
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

/** UI/목록 줄(3002:4512). 화살표는 갈 곳이 있는 줄에만. */
function ListRow({
  href,
  title,
  end,
  brand,
  onClick,
}: {
  href: string;
  title: string;
  end: string;
  brand?: boolean;
  onClick: () => void;
}) {
  return (
    <li>
      <Link
        href={href}
        onClick={onClick}
        className="flex items-center gap-v2-x3 p-v2-x4 active:bg-v2-bg-layer-default-pressed"
      >
        <span
          className={clsx(
            "min-w-0 flex-1 truncate text-v2-t5 font-v2-medium",
            brand ? "text-v2-fg-brand" : "text-v2-fg-neutral",
          )}
        >
          {title}
        </span>
        <span className="flex shrink-0 items-center gap-v2-x1 text-v2-t4 font-v2-medium text-v2-fg-neutral-muted">
          {end}
          <ChevronRight aria-hidden className="size-[var(--roam-v2-icon-size-md)]" />
        </span>
      </Link>
    </li>
  );
}

/** 목록 줄의 하트(8-02, 8-04). 빼기는 5-08 되돌리기, 첫 하트는 5-02 로그인 제안(지도 카드와 한 번을 같이 센다). */
function useListHearts(slug: string, screen: (typeof SCREEN)[keyof typeof SCREEN]) {
  const hydrated = useHydrated();
  const records = useVisitStore((s) => s.records);
  const signedIn = useAuthStore((s) => !!s.user);
  const [snack, setSnack] = useState<SnackbarState | null>(null);
  const closeSnack = useCallback(() => setSnack(null), []);

  const toggleHeart = (b: ListBooth) => {
    const before = useVisitStore.getState().records[b.id];
    const next = !isHearted(before);
    useVisitStore.getState().setHeart(b.id, next);
    void pushNote(b.id, { heart: true });
    const base = { screen, exhibitionSlug: slug, boothId: b.id };
    track(next ? "heart_add" : "heart_remove", { ...base, props: { surface: "list" } });
    if (!next) {
      // 5-08과 같은 되돌리기. 다녀왔어요와 메모는 그대로다(setHeart만 바꾼다).
      setSnack({
        key: Date.now(),
        message: system.heartRemoved(b.name),
        actionLabel: label.undo,
        onAction: () => {
          useVisitStore.getState().restore(b.id, before);
          void pushNote(b.id, { heart: true });
          track("heart_add", {
            ...base,
            screen: SCREEN.heartUndo,
            props: { surface: "list", undo: true },
          });
        },
      });
    } else if (!signedIn && takeLoginPrompt()) {
      setSnack({
        key: Date.now(),
        message: system.loginPrompt,
        actionLabel: label.login,
        onAction: () => useAuthStore.getState().openLogin("heart_snackbar"),
      });
    }
  };

  return { hydrated, records, snack, closeSnack, toggleHeart };
}

/** 8-04 로미가 골라 봤어요: 세 줄, "고른 곳 더 보기"로 열 줄까지. 줄을 누르면 지도에서 그 부스 카드. */
function PicksBlock({
  slug,
  picks,
  booths,
  onNotThis,
}: {
  slug: string;
  picks: FirstPick[];
  booths: ListBooth[];
  onNotThis: (boothId: string) => void;
}) {
  const { hydrated, records, snack, closeSnack, toggleHeart } = useListHearts(slug, SCREEN.picksList);
  const [open, setOpen] = useState(false);
  const byId = new Map(booths.map((b) => [b.id, b]));
  const shown = picks.slice(0, open ? 10 : 3);
  return (
    <div className="flex flex-col">
      <h2 className="px-v2-x4 pt-v2-x2 text-v2-t3 font-v2-bold text-v2-fg-neutral-muted">
        {entryCopy.picksSection}
      </h2>
      <ul className="flex flex-col">
        {shown.map((p) => {
          const b = byId.get(p.boothId);
          if (!b) return null;
          return (
            <li key={b.id} className="flex items-start gap-v2-x3 px-v2-x4 py-v2-x3">
              <div className="flex min-w-0 flex-1 items-start gap-v2-x3">
                <Link
                  href={`/exhibitions/${slug}/map?booth=${b.id}`}
                  aria-label={b.name}
                  onClick={() =>
                    track("booth_list_row_tap", {
                      screen: SCREEN.picksList,
                      exhibitionSlug: slug,
                      boothId: b.id,
                      props: { category_id: "picks" },
                    })
                  }
                  className="flex shrink-0 rounded-v2-r2 active:bg-v2-bg-layer-default-pressed"
                >
                  <Thumb src={b.image} />
                </Link>
                <div className="flex min-w-0 flex-1 flex-col items-start gap-v2-x0-5 font-v2-medium">
                  <Link
                    href={`/exhibitions/${slug}/map?booth=${b.id}`}
                    className="flex min-w-0 flex-col gap-v2-x0-5 rounded-v2-r2 active:bg-v2-bg-layer-default-pressed"
                  >
                    <span className="truncate text-v2-t5 text-v2-fg-neutral">{b.name}</span>
                    <span className="text-v2-t3 text-v2-fg-neutral-muted">
                      {label.hallNumber(b.hall, b.code)}
                    </span>
                  </Link>
                  <span className="pt-v2-x1 text-v2-t3 text-v2-fg-neutral">{p.reason}</span>
                  <button
                    type="button"
                    onClick={() => onNotThis(b.id)}
                    className="-mx-v2-x1 flex min-h-v2-x9 items-center rounded-v2-r2 px-v2-x1 text-v2-t3 text-v2-fg-neutral-muted underline underline-offset-2 active:bg-v2-bg-transparent-pressed"
                  >
                    {entryCopy.notThis}
                  </button>
                </div>
              </div>
              <HeartButton
                on={hydrated && isHearted(records[b.id])}
                onToggle={() => toggleHeart(b)}
              />
            </li>
          );
        })}
      </ul>
      {!open && picks.length > 3 && (
        <ul className="flex flex-col">
          <li>
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="flex w-full items-center gap-v2-x3 p-v2-x4 text-left active:bg-v2-bg-layer-default-pressed"
            >
              <span className="min-w-0 flex-1 text-v2-t5 font-v2-medium text-v2-fg-neutral">
                {entryCopy.morePicks}
              </span>
              <ChevronRight aria-hidden className="size-[var(--roam-v2-icon-size-md)] text-v2-fg-neutral-muted" />
            </button>
          </li>
        </ul>
      )}
      <hr className="mx-v2-x4 border-v2-stroke-neutral-muted" />
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-20 mx-auto w-full max-w-[var(--roam-v2-size-content-max-width)] px-v2-x4 pb-safe">
        {/* 아래 바가 없는 화면이라 안전 영역 위 8(Figma 18-T, 11-25). */}
        <div className="pb-v2-x2">
          <Snackbar state={snack} onClose={closeSnack} className="w-full" />
        </div>
      </div>
    </div>
  );
}

/** 8-02 분류 속 부스 목록. 이름, 홀과 번호, 하트. */
function CategoryBooths({
  slug,
  title,
  booths,
  categoryId,
}: {
  slug: string;
  title: string;
  booths: ListBooth[];
  categoryId: string;
}) {
  const { hydrated, records, snack, closeSnack, toggleHeart } = useListHearts(
    slug,
    SCREEN.boothListCategory,
  );

  return (
    <>
      <div className="flex flex-col gap-v2-x1 px-v2-x4">
        <h1 className="text-v2-t7 font-v2-bold tracking-v2-card-title">{title}</h1>
        <p className="text-v2-t3 font-v2-medium text-v2-fg-neutral-muted">
          {label.byNumber(booths.length)}
        </p>
      </div>
      <ul className="flex flex-col pt-v2-x3">
        {booths.map((b) => (
          <li key={b.id} className="flex items-center gap-v2-x3 px-v2-x4 py-v2-x3">
            <Link
              href={`/exhibitions/${slug}/map?booth=${b.id}`}
              onClick={() =>
                track("booth_list_row_tap", {
                  screen: SCREEN.boothListCategory,
                  exhibitionSlug: slug,
                  boothId: b.id,
                  props: { category_id: categoryId },
                })
              }
              className="-my-v2-x1 flex min-w-0 flex-1 items-center gap-v2-x3 rounded-v2-r2 py-v2-x1 active:bg-v2-bg-layer-default-pressed"
            >
              <Thumb src={b.image} />
              <span className="flex min-w-0 flex-1 flex-col gap-v2-x0-5 font-v2-medium">
                <span className="truncate text-v2-t5 text-v2-fg-neutral">{b.name}</span>
                <span className="text-v2-t3 text-v2-fg-neutral-muted">
                  {label.hallNumber(b.hall, b.code)}
                </span>
              </span>
            </Link>
            <HeartButton
              on={hydrated && isHearted(records[b.id])}
              onToggle={() => toggleHeart(b)}
            />
          </li>
        ))}
      </ul>
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-20 mx-auto w-full max-w-[var(--roam-v2-size-content-max-width)] px-v2-x4 pb-safe">
        {/* 아래 바가 없는 화면이라 안전 영역 위 8(Figma 18-T, 11-25). */}
        <div className="pb-v2-x2">
          <Snackbar state={snack} onClose={closeSnack} className="w-full" />
        </div>
      </div>
    </>
  );
}

/** 사진 자리 48(Figma "사진 자리"). 사진이 없거나 못 불러오면 회색 자리만 둔다(깨진 그림을 보이지 않는다). */
function Thumb({ src }: { src?: string }) {
  const [failed, setFailed] = useState(false);
  // 서버가 그린 <img>는 하이드레이션 전에 실패할 수 있어 onError를 놓친다. 붙은 뒤 한 번 더 본다.
  const ref = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const img = ref.current;
    if (img && img.complete && img.naturalWidth === 0) setFailed(true);
  }, [src]);
  if (!src || failed)
    return <span aria-hidden className="size-v2-x12 shrink-0 rounded-v2-r2 bg-v2-bg-neutral-weak" />;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- 브랜드 사진은 외부 주소가 제각각이라 next/image 도메인 목록에 다 넣을 수 없다
    <img
      ref={ref}
      src={src}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
      className="size-v2-x12 shrink-0 rounded-v2-r2 bg-v2-bg-neutral-weak object-cover"
    />
  );
}
