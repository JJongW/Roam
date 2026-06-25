"use client";

import { memo, useCallback, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Check,
  ChevronRight,
  ChevronLeft,
  Clock3,
  Flame,
  Loader2,
  LogIn,
  LogOut,
  NotebookPen,
  Search,
  Sparkles,
  X,
  MapPin,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import { useVisitStore, idsByStatus, pushNote } from "@/lib/stores/visit";
import { NotePhotos } from "@/components/booth/note-photos";
import { useAuthStore } from "@/lib/stores/auth";
import { useCartStore } from "@/lib/stores/cart";
import { useRouteStore } from "@/lib/stores/route";
import { useHydrated } from "@/lib/hooks/use-hydrated";
import { FLOORPLANS } from "@/lib/floorplans";
import { CartButton } from "@/components/booth/cart-button";
import { Route as RouteIcon } from "lucide-react";
import { AppBar } from "@/components/common/app-bar";
import { ExhibitionMap, HEAT_TIERS } from "@/components/map/exhibition-map";
import { AiRecommendSheet } from "@/components/map/ai-recommend-sheet";
import { CategoryChip } from "@/components/booth/category-chip";
import { EmptyState } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { buildOrderedRoute } from "@/lib/engine/route";
import type { Booth, ExhibitionDetail, Point } from "@/lib/types";

/**
 * One row in the side/sheet booth list. Memoized so that selecting a booth or
 * any map state change re-renders only the rows whose own props changed (the
 * newly + previously selected), not all ~180 — the landscape side panel keeps
 * the full list mounted, so a naive re-render of every row made each tap janky.
 */
const BoothRow = memo(function BoothRow({
  booth,
  selected,
  color,
  onLocate,
}: {
  booth: Booth;
  selected: boolean;
  color: string;
  onLocate: (id: string) => void;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-xl border bg-card px-3 py-2.5",
        selected ? "border-primary" : "border-border",
      )}
    >
      <button
        type="button"
        onClick={() => onLocate(booth.id)}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        <MapPin className="size-4 shrink-0" style={{ color }} />
        {booth.code && (
          <span className="w-12 shrink-0 text-xs font-bold text-muted-foreground">
            {booth.code}
          </span>
        )}
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">
          {booth.name}
        </span>
      </button>
      <CartButton boothId={booth.id} variant="icon" />
    </div>
  );
});

export function MapView({
  detail,
  booths,
  initialFocusId,
}: {
  detail: ExhibitionDetail;
  booths: Booth[];
  /** Deep-link target (e.g. from the 메모장 "지도에서 보기"): preselect + center. */
  initialFocusId?: string;
}) {
  const router = useRouter();
  const [activeCat, setActiveCat] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<
    "visited" | "skipped" | null
  >(null);
  const [selectedId, setSelectedId] = useState<string | null>(
    initialFocusId ?? null,
  );
  const [centerOn, setCenterOn] = useState<string | null>(
    initialFocusId ?? null,
  );
  const [query, setQuery] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  // Crowd heatmap (방문객이 많이 담은 부스·복도). Lazy-loaded the first time it's on.
  const [heatOn, setHeatOn] = useState(false);
  const [heat, setHeat] = useState<{
    booths: Record<string, number>;
    pairs: { from: string; to: string; count: number }[];
  } | null>(null);
  const [heatLoading, setHeatLoading] = useState(false);
  // pointer tracking for drag-to-toggle on the sheet handle
  const dragStart = useRef<number | null>(null);
  // drag-down on the list (when scrolled to top) collapses the sheet
  const listDrag = useRef<number | null>(null);

  const hydrated = useHydrated();
  const cartCount = useCartStore((s) => s.ids.length);
  const storeRecords = useVisitStore((s) => s.records);
  const toggleStatus = useVisitStore((s) => s.toggleStatus);
  // Empty until hydrated so SSR markup matches the first client paint.
  const records = hydrated ? storeRecords : {};
  const visitedIds = useMemo(() => idsByStatus(records, "visited"), [records]);
  const skippedIds = useMemo(() => idsByStatus(records, "skipped"), [records]);
  const visitedSet = useMemo(() => new Set(visitedIds), [visitedIds]);
  const skippedSet = useMemo(() => new Set(skippedIds), [skippedIds]);
  const hasStatus = visitedIds.length > 0 || skippedIds.length > 0;

  const catById = useMemo(
    () => new Map(detail.categories.map((c) => [c.id, c])),
    [detail.categories],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return booths.filter((b) => {
      if (activeCat && b.categoryId !== activeCat) return false;
      if (statusFilter === "visited" && !visitedSet.has(b.id)) return false;
      if (statusFilter === "skipped" && !skippedSet.has(b.id)) return false;
      if (
        q &&
        !`${b.name} ${b.company} ${b.code ?? ""} ${(b.aliases ?? []).join(" ")}`
          .toLowerCase()
          .includes(q)
      )
        return false;
      return true;
    });
  }, [booths, activeCat, statusFilter, visitedSet, skippedSet, query]);

  const cartIds = useCartStore((s) => s.ids);
  const boothById = useMemo(
    () => new Map(booths.map((b) => [b.id, b])),
    [booths],
  );

  // Visitor-chosen entrance / exit (the route sweep starts at the entrance and
  // the drawn path ends at the exit; defaults to the floorplan's own gates).
  const fp = FLOORPLANS[detail.exhibition.slug];
  const gates = fp?.gates ?? [];
  // Split gates by role — the 입구 picker only offers entrances, the 출구 picker
  // only exits, so you can't pick an exit as your start (or vice versa).
  const entranceGates = gates.filter((g) => g.kind === "in");
  const exitGates = gates.filter((g) => g.kind === "out");
  const fallbackStart: Point = fp?.entrance ?? {
    x: Math.round(detail.exhibition.mapWidth / 2),
    y: detail.exhibition.mapHeight,
  };
  const [entranceId, setEntranceId] = useState<string>(
    () =>
      entranceGates.find(
        (g) => g.x === fp?.entrance?.x && g.y === fp?.entrance?.y,
      )?.id ??
      entranceGates[0]?.id ??
      "",
  );
  const [exitId, setExitId] = useState<string>(
    () =>
      exitGates.find((g) => g.x === fp?.exit?.x && g.y === fp?.exit?.y)?.id ??
      exitGates[exitGates.length - 1]?.id ??
      "",
  );
  const start: Point = useMemo(() => {
    const g = gates.find((x) => x.id === entranceId);
    return g ? { x: g.x, y: g.y } : fallbackStart;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entranceId]);
  const exitPoint: Point | undefined = useMemo(() => {
    const g = gates.find((x) => x.id === exitId);
    return g ? { x: g.x, y: g.y } : fp?.exit;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exitId]);

  // The in-progress 동선, drawn on the map so adding booths shows the existing
  // route too — it re-orders live as the cart changes.
  const routeOrderIds = useMemo(() => {
    if (!hydrated || cartIds.length === 0) return undefined;
    const cartBooths = cartIds
      .map((id) => boothById.get(id))
      .filter((b): b is Booth => Boolean(b));
    return buildOrderedRoute(cartBooths, start).boothIds;
  }, [hydrated, cartIds, boothById, start]);
  // Render the filtered set PLUS any route booths, so the path never breaks when
  // a category/status filter hides one of the chosen stands.
  const mapBooths = useMemo(() => {
    if (!routeOrderIds?.length) return filtered;
    const seen = new Set(filtered.map((b) => b.id));
    const extra = routeOrderIds
      .map((id) => boothById.get(id))
      .filter((b): b is Booth => b != null && !seen.has(b.id));
    return extra.length ? [...filtered, ...extra] : filtered;
  }, [filtered, routeOrderIds, boothById]);

  const selected = booths.find((b) => b.id === selectedId) ?? null;
  const selectedCat = selected ? catById.get(selected.categoryId) : undefined;
  const selectedStatus = selected ? records[selected.id]?.status : undefined;

  // Select a booth from the list/search: mark it, recentre the map on it, and
  // collapse the (mobile) sheet so the map is visible.
  const locate = useCallback((id: string) => {
    setSelectedId(id);
    setCenterOn(id);
    setSheetOpen(false);
  }, []);

  // Clear the in-progress 동선: empties the cart (which the map draws the route
  // from) and any AI route, so the map starts fresh.
  function clearRoute() {
    useCartStore.getState().clear();
    useRouteStore.getState().clear();
    setSelectedId(null);
    toast.success("동선을 비웠어요");
  }

  // Toggle the crowd heatmap; fetch the aggregate once, then just show/hide.
  function toggleHeat() {
    const next = !heatOn;
    setHeatOn(next);
    if (next && !heat && !heatLoading) {
      setHeatLoading(true);
      api
        .get<{
          booths: Record<string, number>;
          pairs: { from: string; to: string; count: number }[];
        }>(`/api/exhibitions/${detail.exhibition.slug}/heatmap`)
        .then((d) => {
          setHeat(d);
          const total = Object.keys(d.booths).length;
          if (total === 0)
            toast("아직 인기 데이터가 쌓이는 중이에요", {
              description: "방문객들이 동선을 저장할수록 또렷해져요.",
            });
        })
        .catch(() => toast.error("인기 정보를 불러오지 못했어요"))
        .finally(() => setHeatLoading(false));
    }
  }

  function onHandleUp(e: React.PointerEvent) {
    const start = dragStart.current;
    dragStart.current = null;
    if (start == null) return;
    const dy = e.clientY - start;
    if (dy > 30) setSheetOpen(false);
    else if (dy < -30) setSheetOpen(true);
    else setSheetOpen((o) => !o);
  }

  // ---- shared render helpers (mobile sheet + desktop side panel) ----

  // The map's secondary destinations + AI action. Shared by the portrait top
  // bar and the landscape/desktop side panel so every layout reaches them.
  function renderMapActions() {
    const slug = detail.exhibition.slug;
    return (
      <>
        <Link
          href={`/exhibitions/${slug}/notes`}
          aria-label="내 메모장"
          className="flex h-11 items-center gap-1 rounded-full px-2 text-sm font-bold text-muted-foreground active:bg-secondary"
        >
          <NotebookPen className="size-5" /> 메모장
        </Link>
        <Link
          href={`/exhibitions/${slug}/routes`}
          aria-label="다른 사람 동선"
          className="flex h-11 items-center gap-1 rounded-full px-2 text-sm font-bold text-muted-foreground active:bg-secondary"
        >
          <RouteIcon className="size-5" /> 다른 동선
        </Link>
        <button
          type="button"
          onClick={() => setAiOpen(true)}
          aria-label="AI 추천받기"
          className="flex h-11 items-center gap-1 rounded-full px-2 text-sm font-bold text-primary active:bg-secondary"
        >
          <Sparkles className="size-5" /> AI 추천
        </button>
      </>
    );
  }

  function renderSearch() {
    return (
      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (e.target.value) setSheetOpen(true);
          }}
          onFocus={() => setSheetOpen(true)}
          placeholder="부스명·브랜드·번호 검색"
          className="h-10 pl-9 pr-9"
          aria-label="부스 검색"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="검색어 지우기"
            className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 hover:bg-secondary"
          >
            <X className="size-4" />
          </button>
        )}
      </div>
    );
  }

  function renderCategoryChips() {
    return (
      <>
        <FilterChip
          active={activeCat === null}
          onClick={() => setActiveCat(null)}
        >
          전체 {booths.length}
        </FilterChip>
        {detail.categories.map((c) => (
          <FilterChip
            key={c.id}
            active={activeCat === c.id}
            onClick={() => setActiveCat(c.id)}
            color={c.color}
          >
            {c.name}
          </FilterChip>
        ))}
      </>
    );
  }

  function renderGateSelectors() {
    return (
      <div className="flex items-center gap-2">
        <label className="flex flex-1 items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-sm">
          <LogIn className="size-4 shrink-0 text-success" aria-hidden />
          <span className="shrink-0 text-muted-foreground">입구</span>
          <select
            value={entranceId}
            onChange={(e) => setEntranceId(e.target.value)}
            aria-label="입구 선택"
            className="min-w-0 flex-1 bg-transparent font-semibold outline-none"
          >
            {entranceGates.map((g) => (
              <option key={g.id} value={g.id}>
                {g.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-1 items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-sm">
          <LogOut className="size-4 shrink-0 text-warning" aria-hidden />
          <span className="shrink-0 text-muted-foreground">출구</span>
          <select
            value={exitId}
            onChange={(e) => setExitId(e.target.value)}
            aria-label="출구 선택"
            className="min-w-0 flex-1 bg-transparent font-semibold outline-none"
          >
            {exitGates.map((g) => (
              <option key={g.id} value={g.id}>
                {g.label}
              </option>
            ))}
          </select>
        </label>
      </div>
    );
  }

  function renderHeatToggle() {
    return (
      <button
        type="button"
        onClick={toggleHeat}
        aria-pressed={heatOn}
        className={cn(
          "inline-flex shrink-0 items-center gap-1 rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors",
          heatOn
            ? "border-[#f97316] bg-[#f97316]/12 text-[#c2410c]"
            : "border-border bg-card text-foreground",
        )}
      >
        {heatLoading ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <Flame className="size-3.5" />
        )}
        {heatLoading ? "인기 부르는 중" : "인기"}
      </button>
    );
  }

  function renderStatusChips() {
    return (
      <>
        <StatusChip
          active={statusFilter === "visited"}
          onClick={() =>
            setStatusFilter((s) => (s === "visited" ? null : "visited"))
          }
          tone="success"
        >
          <Check className="size-3.5" /> 방문함 {visitedIds.length}
        </StatusChip>
        <StatusChip
          active={statusFilter === "skipped"}
          onClick={() =>
            setStatusFilter((s) => (s === "skipped" ? null : "skipped"))
          }
          tone="warning"
        >
          <Clock3 className="size-3.5" /> 이따 다시 {skippedIds.length}
        </StatusChip>
      </>
    );
  }

  function renderList() {
    if (filtered.length === 0)
      return (
        <EmptyState
          title="검색 결과가 없어요"
          description="다른 키워드나 카테고리로 찾아보세요."
        />
      );
    return (
      <>
        <p className="px-1 pb-1.5 text-xs text-muted-foreground">
          {filtered.length}개 부스 · 항목을 누르면 지도에서 위치를 보여줘요
        </p>
        <div className="space-y-1.5">
          {filtered.map((b) => (
            <BoothRow
              key={b.id}
              booth={b}
              selected={b.id === selectedId}
              color={
                catById.get(b.categoryId)?.color ?? "var(--muted-foreground)"
              }
              onLocate={locate}
            />
          ))}
        </div>
      </>
    );
  }

  return (
    // The visitor shell boxes pages to max-w-md (mobile frame). The map needs
    // full width on desktop, so break out of that box at md+ with fixed inset-0.
    <div className="flex h-dvh flex-col overflow-hidden overscroll-none bg-background md:fixed md:inset-0 md:z-30 md:flex-row landscape:fixed landscape:inset-0 landscape:z-30 landscape:flex-row">
      {/* Wide / landscape: always-open side panel (search + filters + list).
          The portrait bottom sheet is hidden here. Selecting in either syncs. */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-card md:flex md:w-80 landscape:flex">
        <div className="flex items-center gap-1 border-b border-border px-3 py-3">
          <button
            type="button"
            aria-label="전시 홈으로"
            onClick={() => router.push("/")}
            className="flex size-9 items-center justify-center rounded-full hover:bg-secondary"
          >
            <ChevronLeft className="size-5" />
          </button>
          <h1 className="text-lg font-extrabold">전시장 지도</h1>
        </div>
        <div className="flex flex-wrap items-center gap-0.5 border-b border-border px-2 py-1.5">
          {renderMapActions()}
        </div>
        <div className="border-b border-border p-3">{renderSearch()}</div>
        {gates.length > 1 && (
          <div className="border-b border-border p-3">
            {renderGateSelectors()}
          </div>
        )}
        <div className="no-scrollbar flex gap-1.5 overflow-x-auto border-b border-border px-3 py-2.5">
          {renderHeatToggle()}
          {renderCategoryChips()}
        </div>
        {hasStatus && (
          <div className="no-scrollbar flex gap-1.5 overflow-x-auto border-b border-border px-3 py-2">
            {renderStatusChips()}
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto p-3">{renderList()}</div>
      </aside>

      {/* Mobile chrome + map column */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Portrait top bar — always visible (landscape/desktop use the panel).
            It stays put during zoom/pan so the map doesn't jump. */}
        <div className="md:hidden landscape:hidden">
          <AppBar
            title="지도"
            onBack={() => router.push("/")}
            right={renderMapActions()}
          />
        </div>

        <div className="relative flex-1 overflow-hidden">
          {/* Heat legend — only while 인기 is on, so the booth tints have a key
              (color isn't the only cue: each step is labelled). */}
          {heatOn && (
            <div className="pointer-events-none absolute left-3 top-3 z-20 flex flex-col gap-1 rounded-xl border border-border bg-card/90 px-2.5 py-2 text-[11px] font-semibold shadow-[var(--shadow-card)] backdrop-blur">
              <span className="text-muted-foreground">혼잡도</span>
              <div className="flex items-center gap-2">
                {HEAT_TIERS.map((t) => (
                  <span key={t.key} className="flex items-center gap-1">
                    <span
                      className="size-3 rounded-[3px]"
                      style={{ backgroundColor: t.fill }}
                    />
                    {t.key}
                  </span>
                ))}
              </div>
            </div>
          )}
          <ExhibitionMap
            width={detail.exhibition.mapWidth}
            height={detail.exhibition.mapHeight}
            booths={mapBooths}
            categories={detail.categories}
            halls={detail.halls}
            routeOrder={routeOrderIds}
            floorplan={FLOORPLANS[detail.exhibition.slug]}
            entrance={start}
            exit={exitPoint}
            fillHeight
            // Mobile portrait: keep the fit/pan area above the bottom-sheet peek
            // (~116px) so the bottom of the venue isn't clipped behind it.
            // Desktop (side panel) and landscape have no sheet → fill fully.
            viewportClassName="inset-x-0 top-0 bottom-[92px] md:inset-0 landscape:inset-0"
            // A selected booth opens the bottom popup (and on md/landscape a
            // right-docked card), both of which would sit on top of the
            // bottom-right controls. Lift the zoom/rotate controls to the
            // top-right while a booth is selected so they stay reachable.
            controlsClassName={
              selected
                ? "top-3 right-3"
                : "bottom-[100px] right-3 md:bottom-4 landscape:bottom-4"
            }
            visitedIds={visitedIds}
            skippedIds={skippedIds}
            selectedId={selectedId}
            centerOn={centerOn}
            // Portrait: the booth popup sits at the bottom (~320px tall incl.
            // its offset). Bias focused booths upward so they aren't hidden.
            focusBottomInset={320}
            heat={heatOn ? heat?.booths : undefined}
            heatPairs={heatOn ? heat?.pairs : undefined}
            onSelect={(id) => {
              setSelectedId(id);
              if (id) setSheetOpen(false);
            }}
            onInteractStart={() => setSheetOpen(false)}
          />

          {/* selected booth popup — decision info + quick actions. Sits above
              the sheet peek on mobile; bottom-right card on desktop. */}
          {selected && (
            <div className="absolute inset-x-0 bottom-[100px] z-20 mx-auto w-full max-w-sm px-3 md:inset-x-auto md:bottom-3 md:right-3 md:w-72 md:px-0 landscape:inset-x-auto landscape:bottom-3 landscape:right-3 landscape:w-72 landscape:px-0">
              <div className="rounded-2xl border border-border bg-card p-3 shadow-[var(--shadow-pop)] animate-in slide-in-from-bottom-2">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold">
                      {selected.name}
                      {selected.code && (
                        <span className="ml-1.5 text-xs text-muted-foreground">
                          {selected.code}
                        </span>
                      )}
                    </p>
                    <p className="truncate text-sm text-muted-foreground">
                      {selected.company}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      {selectedCat && <CategoryChip category={selectedCat} />}
                    </div>
                  </div>
                  <Button asChild size="sm">
                    <Link href={`/booths/${selected.id}`}>
                      상세 <ChevronRight className="size-4" />
                    </Link>
                  </Button>
                </div>

                <BoothPopupMemo key={selected.id} boothId={selected.id} />

                <div className="mt-2.5 flex items-center gap-2 border-t border-border pt-2.5">
                  <CartButton boothId={selected.id} variant="icon" />
                  <PopupToggle
                    active={selectedStatus === "visited"}
                    tone="success"
                    onClick={() => toggleStatus(selected.id, "visited")}
                  >
                    <Check className="size-4" /> 방문
                  </PopupToggle>
                  <PopupToggle
                    active={selectedStatus === "skipped"}
                    tone="warning"
                    onClick={() => toggleStatus(selected.id, "skipped")}
                  >
                    <Clock3 className="size-4" /> 이따
                  </PopupToggle>
                </div>
              </div>
            </div>
          )}

          {/* The map is the route surface — booths are added here and the line
              draws live. Show the count + a clear when there's a 동선. */}
          {hydrated && !selected && cartCount > 0 && (
            <div className="absolute inset-x-0 bottom-[108px] z-20 mx-auto flex w-fit md:inset-x-auto md:bottom-4 md:right-4 landscape:inset-x-auto landscape:bottom-4 landscape:right-4">
              <div className="flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2.5 shadow-[var(--shadow-pop)]">
                <RouteIcon className="size-4 text-primary" />
                <span className="text-sm font-bold">담은 {cartCount}곳</span>
                <button
                  type="button"
                  onClick={clearRoute}
                  aria-label="동선 비우기"
                  className="-mr-1 flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground active:bg-secondary"
                >
                  <X className="size-4" />
                </button>
              </div>
            </div>
          )}

          {/* bottom sheet: search + booth list. Mobile only (md:hidden). */}
          <div
            className={cn(
              "absolute inset-x-0 bottom-0 z-30 flex flex-col rounded-t-2xl border-t border-border bg-card shadow-[var(--shadow-pop)] transition-[height] duration-300 ease-out md:hidden landscape:hidden",
              sheetOpen ? "h-[62dvh]" : "h-[92px]",
            )}
          >
            <button
              type="button"
              aria-label={sheetOpen ? "목록 접기" : "목록 펼치기"}
              className="flex w-full shrink-0 cursor-grab touch-none justify-center py-2 active:cursor-grabbing"
              onPointerDown={(e) => (dragStart.current = e.clientY)}
              onPointerUp={onHandleUp}
            >
              <span className="h-1.5 w-10 rounded-full bg-border" />
            </button>

            {/* Collapsed peek = just the search; pull up to filter + browse. */}
            <div
              className="px-4 pb-2"
              onPointerDown={() => !sheetOpen && setSheetOpen(true)}
            >
              {renderSearch()}
            </div>

            {/* Collapsed = search only. Filters, gates, and list appear when
                the sheet is pulled up. */}
            {sheetOpen && (
              <div
                className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4"
                onPointerDown={(e) => {
                  // Only arm collapse-on-drag when the list is at the top, so
                  // mid-list scrolling isn't hijacked.
                  listDrag.current =
                    e.currentTarget.scrollTop <= 0 ? e.clientY : null;
                }}
                onPointerMove={(e) => {
                  if (listDrag.current == null) return;
                  if (e.clientY - listDrag.current > 48) {
                    setSheetOpen(false);
                    listDrag.current = null;
                  }
                }}
                onPointerUp={() => (listDrag.current = null)}
                onPointerCancel={() => (listDrag.current = null)}
              >
                {/* 입구/출구 — between the search and the category filters. */}
                {gates.length > 1 && (
                  <div className="mb-2">{renderGateSelectors()}</div>
                )}
                <div className="no-scrollbar -mx-1 mb-2 flex gap-1.5 overflow-x-auto px-1">
                  {renderHeatToggle()}
                  {renderCategoryChips()}
                </div>
                {hasStatus && (
                  <div className="no-scrollbar -mx-1 mb-2 flex gap-1.5 overflow-x-auto px-1">
                    {renderStatusChips()}
                  </div>
                )}
                {renderList()}
              </div>
            )}
          </div>
        </div>
      </div>

      <AiRecommendSheet
        slug={detail.exhibition.slug}
        open={aiOpen}
        onClose={() => setAiOpen(false)}
      />
    </div>
  );
}

function FilterChip({
  active,
  color,
  onClick,
  children,
}: {
  active: boolean;
  color?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-card text-foreground",
      )}
      style={
        active && color
          ? { backgroundColor: color, borderColor: color }
          : undefined
      }
    >
      {children}
    </button>
  );
}

function StatusChip({
  active,
  tone,
  onClick,
  children,
}: {
  active: boolean;
  tone: "success" | "warning";
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-bold transition-colors",
        active
          ? tone === "success"
            ? "border-success bg-success/15 text-success"
            : "border-warning bg-warning/15 text-[#9a6700]"
          : "border-border bg-card text-muted-foreground",
      )}
    >
      {children}
    </button>
  );
}

/**
 * Inline memo for the map popup — jot a quick note the moment you tap a booth,
 * without opening the detail page. The saved note stays visible here (and on the
 * booth detail) so a glance reminds you why you flagged it. Local-first;
 * signing in syncs it across devices. Keyed by boothId so it resets per booth.
 */
function BoothPopupMemo({ boothId }: { boothId: string }) {
  const user = useAuthStore((s) => s.user);
  const initial = useVisitStore((s) => s.records[boothId]?.memo ?? "");
  const setMemo = useVisitStore((s) => s.setMemo);
  const [value, setValue] = useState(initial);

  function save() {
    if (value.trim() === initial.trim()) return;
    setMemo(boothId, value.trim());
    if (user) void pushNote(boothId);
    toast.success(value.trim() ? "메모를 저장했어요" : "메모를 지웠어요");
  }

  return (
    <div className="mt-2.5">
      <div className="relative">
        <NotebookPen className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return;
            if (e.key === "Enter") e.currentTarget.blur();
          }}
          placeholder="메모 남기기 (입력 후 Enter로 저장)"
          maxLength={100}
          aria-label="부스 메모"
          className="h-9 pl-8 text-sm"
        />
      </div>
      <NotePhotos boothId={boothId} compact />
    </div>
  );
}

/** Compact visit/skip toggle inside the map popup. */
function PopupToggle({
  active,
  tone,
  onClick,
  children,
}: {
  active: boolean;
  tone: "success" | "warning";
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex flex-1 items-center justify-center gap-1 rounded-lg border py-2 text-xs font-bold transition-colors",
        active
          ? tone === "success"
            ? "border-success bg-success/12 text-success"
            : "border-warning bg-warning/12 text-[#9a6700]"
          : "border-border bg-card text-muted-foreground",
      )}
    >
      {children}
    </button>
  );
}
