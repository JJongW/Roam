"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Bath, Coffee, DoorOpen, Info, Minus, Plus, Package, Search, Utensils, X } from "lucide-react";
import { clsx } from "clsx";
import { ExhibitionMap, type MapHandle } from "@/components/map/exhibition-map";
import { MapLayerV2 } from "@/components/map-v2/map-layer";
import { BoothCardV2 } from "@/components/map-v2/booth-card";
import { HallSwitch } from "@/components/map-v2/hall-switch";
import { RomiAvatar } from "@/components/v2/romi-avatar";
import { BackButton } from "@/components/v2/back-button";
import { FLOORPLANS } from "@/lib/floorplans";
import { floorplanHallOf } from "@/lib/floorplan/hall-of";
import { isHearted, useVisitStore } from "@/lib/stores/visit";
import { useHydrated } from "@/lib/hooks/use-hydrated";
import { AMENITIES, label, romi, system, type AmenityId } from "@/lib/copy/v1";
import { SCREEN, track } from "@/lib/analytics/app-track";
import { trackUiClick } from "@/lib/analytics/ui-controls";
import type { BoothListItem, ExhibitionDetail } from "@/lib/types";

const AMENITY_ICON: Record<AmenityId, typeof Bath> = {
  toilet: Bath,
  restaurant: Utensils,
  cafe: Coffee,
  entrance: DoorOpen,
  storage: Package,
  info: Info,
};

/**
 * UI 3-01 박람회 지도(Figma 2994:1007), 3-02 부스 고른 지도, 3-04~3-06 찾기.
 *
 * 박람회를 고르면 바로 이 화면이다(지도 먼저, 브랜드 규칙 §4). 위에서 아래로:
 * 찾기 줄 → 편의시설 칩 → (오른쪽) 홀 버튼 → 지도 → 아래 로미 줄 또는 부스 카드.
 * 웹에서 다른 점:
 * - 찾기 줄 왼쪽에 뒤로 버튼(iOS는 탭바로 돌아가지만 웹은 박람회 홈으로 돌아갈 길이 필요하다).
 * - 넓은 화면(md 이상)은 손가락 확대가 없어 확대, 축소 버튼을 오른쪽 아래에 둔다.
 *   카드는 왼쪽 아래 고정 폭으로 띄워 지도를 덜 가린다.
 * - 동선 추천, 관심 밀도, 길 안내는 없다(원할 때만, UI 9 이후).
 */
export function FairMapScreen({
  detail,
  booths,
  initialFocusId,
}: {
  detail: ExhibitionDetail;
  booths: BoothListItem[];
  initialFocusId?: string;
}) {
  const slug = detail.exhibition.slug;
  const floorplan = FLOORPLANS[slug];
  const mapRef = useRef<MapHandle>(null);
  const hydrated = useHydrated();
  const records = useVisitStore((s) => s.records);
  const [selectedId, setSelectedId] = useState<string | null>(initialFocusId ?? null);
  const [query, setQuery] = useState("");
  const [amenity, setAmenity] = useState<AmenityId | null>(null);
  const [hall, setHall] = useState<string | null>(null);

  const hallNameById = useMemo(() => new Map(detail.halls.map((h) => [h.id, h.name])), [detail.halls]);
  // 부스의 홀 이름: 배치도가 있으면 부스 칸이 들어 있는 배치도 홀 이름(지도와 같은 말),
  // 없으면 부스 데이터의 홀 이름.
  const hallOf = (b: BoothListItem): string | undefined =>
    floorplanHallOf(floorplan, b.code) ?? hallNameById.get(b.hallId);
  const catById = useMemo(() => new Map(detail.categories.map((c) => [c.id, c])), [detail.categories]);
  const hallNames = useMemo(
    () => (floorplan ? floorplan.halls.map((h) => h.name) : detail.halls.map((h) => h.name)),
    [floorplan, detail.halls],
  );

  const heartIds = useMemo(() => {
    if (!hydrated) return new Set<string>();
    return new Set(Object.entries(records).filter(([, r]) => isHearted(r)).map(([id]) => id));
  }, [records, hydrated]);

  // 편의시설 칩은 이 박람회 데이터에 실제로 있는 종류만 띄운다(없는 칩을 그리지 않는다).
  const amenityMatches = useMemo(() => {
    const out = new Map<AmenityId, string[]>();
    for (const a of AMENITIES) {
      const ids = booths.filter((b) => b.kind === "facility" && a.match.test(b.name)).map((b) => b.id);
      if (ids.length) out.set(a.id, ids);
    }
    return out;
  }, [booths]);

  const q = query.trim().toLowerCase();
  const results = useMemo(() => {
    if (!q) return [];
    return booths.filter(
      (b) =>
        b.kind !== "facility" &&
        [b.name, b.company, b.code, ...(b.aliases ?? [])].some((t) => t?.toLowerCase().includes(q)),
    );
  }, [booths, q]);

  const highlightIds = useMemo(() => {
    if (amenity) return new Set(amenityMatches.get(amenity) ?? []);
    return null;
  }, [amenity, amenityMatches]);

  const selected = selectedId ? booths.find((b) => b.id === selectedId) : undefined;
  const showCard = selected && selected.kind !== "facility";

  // 한 번만: 화면 보기, 지도 불러오기 결과(서버에서 받아 그렸으니 ok, 캐시 아님).
  useEffect(() => {
    track("screen_view", { screen: SCREEN.map, exhibitionSlug: slug });
    track("map_load_result", {
      screen: SCREEN.map,
      exhibitionSlug: slug,
      props: {
        ok: true,
        ms: Math.round(performance.now()),
        from_cache: false,
        booth_count: booths.length,
        hall_count: hallNames.length,
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  const select = (id: string, from: "map" | "search") => {
    setSelectedId(id || null);
    if (id) {
      const b = booths.find((x) => x.id === id);
      if (b && b.kind !== "facility")
        track("booth_card_open", { screen: SCREEN.map, exhibitionSlug: slug, boothId: id, props: { from } });
    }
  };

  const focusIds = (ids: string[], context = 0.3) => {
    const rects = ids
      .map((id) => booths.find((b) => b.id === id))
      .map((b) => (b?.code ? floorplan?.booths.find((fb) => fb.code === b.code) : undefined))
      .filter((r): r is NonNullable<typeof r> => !!r);
    if (!rects.length) return;
    const x0 = Math.min(...rects.map((r) => r.x - r.w / 2));
    const y0 = Math.min(...rects.map((r) => r.y - r.h / 2));
    const x1 = Math.max(...rects.map((r) => r.x + r.w / 2));
    const y1 = Math.max(...rects.map((r) => r.y + r.h / 2));
    const pad = Math.max(x1 - x0, y1 - y0) * context + 60;
    mapRef.current?.focusRect({ x: x0 - pad, y: y0 - pad, w: x1 - x0 + pad * 2, h: y1 - y0 + pad * 2 });
  };

  // "지도에서 보기"(4-02)로 들어오면 그 부스를 이웃과 함께 읽히는 배율로 맞춘다.
  useEffect(() => {
    if (!initialFocusId) return;
    // 엔진이 저장된 보기를 되살리고 크기를 잰 뒤에 맞춘다(그 전에 맞추면 되살린 보기가 덮는다).
    const t = setTimeout(() => focusIds([initialFocusId], 2.5), 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialFocusId]);

  const pickHall = (h: string | null) => {
    setHall(h);
    track("hall_switch", { screen: SCREEN.map, exhibitionSlug: slug, props: { to_all: h === null } });
    if (h === null) return mapRef.current?.reset();
    const r = floorplan?.halls.find((x) => x.name === h);
    if (r) mapRef.current?.focusRect(r);
  };

  const romiLine = hall
    ? romi.inHall(hall)
    : hallNames.length === 1
      ? romi.inHall(hallNames[0])
      : romi.lookAround;

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-v2-bg-layer-basement font-v2-ui">
      <ExhibitionMap
        handleRef={mapRef}
        hideControls
        className="bg-v2-bg-layer-basement"
        width={detail.exhibition.mapWidth}
        height={detail.exhibition.mapHeight}
        booths={booths}
        categories={detail.categories}
        halls={detail.halls}
        floorplan={floorplan}
        entry="whole"
        persistKey={slug}
        exhibitionSlug={slug}
        viewportClassName="inset-0"
        selectedId={selectedId}
        focusBottomInset={showCard ? 280 : 80}
        onSelect={(id) => select(id, "map")}
        renderLayer={(ctx) => <MapLayerV2 ctx={ctx} heartIds={heartIds} highlightIds={highlightIds} />}
      />

      {/* 위: 찾기 줄, 칩, 홀 버튼 */}
      <div
        className={clsx(
          "pointer-events-none absolute left-0 right-0 top-0 z-30 flex flex-col gap-v2-x2 px-v2-x4 pt-safe",
          q && "bottom-v2-x8",
        )}
      >
        <div className="pointer-events-auto flex w-full items-center gap-v2-x2">
          <BackButton
            fallbackHref={`/exhibitions/${slug}`}
            className="shrink-0 border border-v2-stroke-neutral-muted bg-v2-bg-layer-floating shadow-v2-s3"
          />
          <label className="flex min-w-0 flex-1 items-center gap-v2-x2 rounded-v2-pill border border-v2-stroke-neutral-muted bg-v2-bg-layer-floating px-v2-x3 py-v2-x2-5 shadow-v2-s3">
            <Search aria-hidden className="size-[var(--roam-v2-icon-size-md)] shrink-0 text-v2-fg-neutral" />
            <input
              type="text"
              enterKeyHint="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter" || !q) return;
                track("search_submit", { screen: SCREEN.map, exhibitionSlug: slug, props: { booth_count: results.length } });
                if (results.length === 0) track("search_zero_result", { screen: SCREEN.map, exhibitionSlug: slug });
              }}
              placeholder={label.searchPlaceholder}
              aria-label={label.searchPlaceholder}
              className="min-w-0 flex-1 bg-v2-bg-transparent text-v2-t5 text-v2-fg-neutral outline-none placeholder:text-v2-fg-placeholder"
            />
            {query && (
              <button
                type="button"
                aria-label={label.clearSearch}
                onClick={() => setQuery("")}
                className="shrink-0 text-v2-fg-neutral-muted"
              >
                <X aria-hidden className="size-[var(--roam-v2-icon-size-md)]" />
              </button>
            )}
          </label>
        </div>

        {q ? (
          <SearchResults
            query={query.trim()}
            results={results}
            hallOf={hallOf}
            onPick={(b, index) => {
              track("search_result_tap", { screen: SCREEN.map, exhibitionSlug: slug, boothId: b.id, props: { index } });
              setQuery("");
              setAmenity(null);
              select(b.id, "search");
              // 찾은 부스를 이웃 칸과 함께 읽히는 배율로 맞춘다(전체 보기에선 너무 작다).
              focusIds([b.id], 2.5);
            }}
          />
        ) : (
          amenityMatches.size > 0 && (
            <div className="pointer-events-auto flex w-full gap-v2-between-chips overflow-x-auto pb-v2-x1">
              {AMENITIES.filter((a) => amenityMatches.has(a.id)).map((a) => {
                const Icon = AMENITY_ICON[a.id];
                const on = amenity === a.id;
                return (
                  <button
                    key={a.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => {
                      const next = on ? null : a.id;
                      setAmenity(next);
                      if (next) focusIds(amenityMatches.get(next) ?? []);
                    }}
                    className={clsx(
                      "flex shrink-0 items-center gap-v2-x1 rounded-v2-pill border px-v2-x2-5 py-v2-x1-5 text-v2-t4 font-v2-medium shadow-v2-s2",
                      on
                        ? "border-v2-stroke-brand-weak bg-v2-bg-brand-weak text-v2-fg-brand"
                        : "border-v2-stroke-neutral-muted bg-v2-bg-layer-floating text-v2-fg-neutral",
                    )}
                  >
                    <Icon aria-hidden className="size-[var(--roam-v2-icon-size-sm)]" />
                    {a.title}
                  </button>
                );
              })}
            </div>
          )
        )}

        {!q && (
          <div className="flex w-full justify-end">
            <HallSwitch halls={hallNames} current={hall} onPick={pickHall} className="pointer-events-auto" />
          </div>
        )}
      </div>

      {/* 넓은 화면: 확대, 축소 */}
      <div className="absolute right-v2-x4 top-1/2 z-10 hidden -translate-y-1/2 flex-col gap-v2-x1 rounded-v2-pill bg-v2-bg-layer-floating p-v2-x1 shadow-v2-s3 md:flex">
        {(
          [
            ["zoom_in", "map_zoom_in", label.zoomIn, Plus],
            ["zoom_out", "map_zoom_out", label.zoomOut, Minus],
          ] as const
        ).map(([control, legacy, aria, Icon]) => (
          <button
            key={control}
            type="button"
            aria-label={aria}
            onClick={() => {
              trackUiClick({ exhibitionSlug: slug }, legacy);
              track("map_control", { screen: SCREEN.map, exhibitionSlug: slug, props: { control } });
              if (control === "zoom_in") mapRef.current?.zoomIn();
              else mapRef.current?.zoomOut();
            }}
            className="flex size-v2-x9 items-center justify-center rounded-v2-full text-v2-fg-neutral active:bg-v2-bg-transparent-pressed"
          >
            <Icon aria-hidden className="size-[var(--roam-v2-icon-size-md)]" />
          </button>
        ))}
      </div>

      {/* 아래: 부스 카드 또는 로미 줄 */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 px-v2-x4 pb-safe">
        {q ? null : showCard ? (
          <BoothCardV2
            key={selected.id}
            booth={selected}
            hallName={hallOf(selected)}
            categories={[catById.get(selected.categoryId)].filter((c): c is NonNullable<typeof c> => !!c)}
            exhibitionSlug={slug}
            className="w-full pb-v2-x2"
          />
        ) : (
          <div className="flex w-full justify-center pb-v2-x2">
            <p className="pointer-events-auto flex items-center gap-v2-x2 rounded-v2-pill border border-v2-stroke-neutral-muted bg-v2-bg-layer-floating py-v2-x1 pl-v2-x1 pr-v2-x4 text-v2-t4 font-v2-medium text-v2-fg-neutral shadow-v2-s2">
              <RomiAvatar size="sm" className="shadow-v2-s1" />
              {romiLine}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function SearchResults({
  query,
  results,
  hallOf,
  onPick,
}: {
  query: string;
  results: BoothListItem[];
  hallOf: (b: BoothListItem) => string | undefined;
  onPick: (b: BoothListItem, index: number) => void;
}) {
  return (
    <section className="pointer-events-auto flex min-h-0 w-full shrink flex-col overflow-hidden rounded-[var(--roam-v2-trial-radius-card-1)] border border-v2-stroke-neutral-muted bg-v2-bg-layer-floating shadow-v2-s2">
      {results.length === 0 ? (
        <div className="flex flex-col gap-v2-x1 p-v2-x4">
          <p className="text-v2-t5 font-v2-bold text-v2-fg-neutral">{system.searchEmptyTitle(query)}</p>
          <p className="text-v2-t4 text-v2-fg-neutral-muted">{system.searchEmptyBody}</p>
        </div>
      ) : (
        <>
          <p className="px-v2-x4 pb-v2-x1 pt-v2-x3 text-v2-t3 font-v2-medium text-v2-fg-neutral-muted">
            {system.searchCount(results.length)}
          </p>
          <ul className="overflow-y-auto pb-v2-x2">
            {results.slice(0, 50).map((b, i) => (
              <li key={b.id}>
                <button
                  type="button"
                  onClick={() => onPick(b, i)}
                  className="flex w-full flex-col items-start gap-v2-x0-5 px-v2-x4 py-v2-x2-5 text-left active:bg-v2-bg-layer-floating-pressed"
                >
                  <span className="text-v2-t5 font-v2-medium text-v2-fg-neutral">{b.name}</span>
                  <span className="text-v2-t3 font-v2-medium text-v2-fg-neutral-muted">
                    {label.hallNumber(hallOf(b), b.code)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
