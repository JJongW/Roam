"use client";

import {
  memo,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Check,
  ChevronRight,
  ChevronLeft,
  Star,
  Flame,
  Loader2,
  LogIn,
  LogOut,
  NotebookPen,
  Search,
  Sparkles,
  X,
  MapPin,
  MessagesSquare,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import { useVisitStore, idsByStatus, pushNote } from "@/lib/stores/visit";
import { NotePhotos } from "@/components/booth/note-photos";
import { useAuthStore } from "@/lib/stores/auth";
import { useCartStore } from "@/lib/stores/cart";
import { useRouteStore } from "@/lib/stores/route";
import { useUiStore } from "@/lib/stores/ui";
import { useHydrated } from "@/lib/hooks/use-hydrated";
import { MapCoachmark } from "@/components/map/map-coachmark";
import { FLOORPLANS } from "@/lib/floorplans";
import { CartButton } from "@/components/booth/cart-button";
import { Route as RouteIcon } from "lucide-react";
import { AppBar } from "@/components/common/app-bar";
import { ExhibitionMap, HEAT_TIERS } from "@/components/map/exhibition-map";
import { AiRecommendSheet } from "@/components/map/ai-recommend-sheet";
import { NotesView } from "@/components/booth/notes-view";
import { CategoryChip } from "@/components/booth/category-chip";
import { EmptyState } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { buildHallSweepRoute } from "@/lib/engine/route";
import { LOADING_MESSAGES } from "@/lib/loading-messages";
import { useRotatingMessage } from "@/lib/hooks/use-rotating-message";
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
  orderNumber,
}: {
  booth: Booth;
  selected: boolean;
  color: string;
  onLocate: (id: string) => void;
  /** When set ("선택한 부스" list), show the route 순번 badge instead of the map pin. */
  orderNumber?: number;
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
        {orderNumber != null ? (
          <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
            {orderNumber}
          </span>
        ) : (
          <MapPin className="size-4 shrink-0" style={{ color }} />
        )}
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
  // Sentinel category value for the "선택된 부스" (cart) filter chip.
  const SELECTED_FILTER = "__selected__";
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
  const [notesOpen, setNotesOpen] = useState(false);
  // 뒤로가기 시 "관람이 끝나셨나요?" 확인. 동선이 있을 때만 묻는다.
  const [finishOpen, setFinishOpen] = useState(false);
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
  const records = useMemo(
    () => (hydrated ? storeRecords : {}),
    [hydrated, storeRecords],
  );
  const visitedIds = useMemo(() => idsByStatus(records, "visited"), [records]);
  const skippedIds = useMemo(() => idsByStatus(records, "skipped"), [records]);
  const visitedSet = useMemo(() => new Set(visitedIds), [visitedIds]);
  const skippedSet = useMemo(() => new Set(skippedIds), [skippedIds]);

  // First-visit map guide + one-time landscape hint (see ui store).
  const mapGuideSeen = useUiStore((s) => s.mapGuideSeen);
  const markMapGuideSeen = useUiStore((s) => s.markMapGuideSeen);
  const landscapeHintSeen = useUiStore((s) => s.landscapeHintSeen);
  const markLandscapeHintSeen = useUiStore((s) => s.markLandscapeHintSeen);
  const showCoachmark = hydrated && !mapGuideSeen;

  // Once the guide is dismissed, the next portrait visit hints (once) that the
  // map can be rotated to landscape — the wider side-panel layout is easy to
  // miss on a phone.
  useEffect(() => {
    if (!hydrated || showCoachmark || landscapeHintSeen) return;
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(orientation: portrait)").matches
    ) {
      toast("가로로 돌리면 지도를 더 넓게 볼 수 있어요");
    }
    markLandscapeHintSeen();
  }, [hydrated, showCoachmark, landscapeHintSeen, markLandscapeHintSeen]);
  const hasStatus = visitedIds.length > 0 || skippedIds.length > 0;

  const catById = useMemo(
    () => new Map(detail.categories.map((c) => [c.id, c])),
    [detail.categories],
  );

  // Defer the search term so typing stays instant: the input updates live, but
  // the (heavy) filtered list + map re-render run as a non-blocking, lower-prio
  // pass — no per-keystroke jank from reconciling ~180 list rows + map booths.
  const deferredQuery = useDeferredValue(query);
  const cartIds = useCartStore((s) => s.ids);
  const cartSet = useMemo(() => new Set(cartIds), [cartIds]);
  const filtered = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    return booths.filter((b) => {
      // SELECTED_FILTER affects only the LIST (see listBooths), not the map —
      // the map keeps showing every booth. So here it's a no-op (show all).
      if (
        activeCat &&
        activeCat !== SELECTED_FILTER &&
        b.categoryId !== activeCat
      )
        return false;
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
  }, [booths, activeCat, statusFilter, visitedSet, skippedSet, deferredQuery]);
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

  // The in-progress 동선, drawn on the map. 체크한 부스(cart)는 그대로 두되, 입구
  // 기준 가장 가까운 순(홀 인지 스윕)으로 매번 재정렬하고 출구 쪽으로 흐르게 한다.
  // 입구·출구를 바꾸면 start/exitPoint가 갱신돼 순서가 다시 최적화된다.
  const routeOrderIds = useMemo(() => {
    if (!hydrated || cartIds.length === 0) return undefined;
    const cartBooths = cartIds
      .map((id) => boothById.get(id))
      .filter((b): b is Booth => Boolean(b));
    return buildHallSweepRoute(cartBooths, start, {}, exitPoint).boothIds;
  }, [hydrated, cartIds, boothById, start, exitPoint]);

  // List rows. In the "선택한 부스" filter, narrow to cart booths and order by the
  // route sweep (순번 앞으로) — the map itself still shows everything.
  const listBooths = useMemo(() => {
    if (activeCat !== SELECTED_FILTER) return filtered;
    const seq = routeOrderIds ?? cartIds;
    const order = new Map(seq.map((id, i) => [id, i]));
    return filtered
      .filter((b) => cartSet.has(b.id))
      .sort(
        (a, b) =>
          (order.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
          (order.get(b.id) ?? Number.MAX_SAFE_INTEGER),
      );
  }, [activeCat, filtered, routeOrderIds, cartIds, cartSet]);

  // 입구/출구를 바꾸면 동선을 다시 짠다 — 재정렬은 즉시(순수 계산)지만, 바뀐 게
  // 분명히 느껴지도록 짧게 로딩 오버레이를 띄운 뒤 새 순서를 보여준다.
  // 입·출구 선택 핸들러에서 직접 부르므로 최초 마운트엔 뜨지 않는다.
  const [reordering, setReordering] = useState(false);
  const reorderMsg = useRotatingMessage(LOADING_MESSAGES.route, reordering);
  const reorderTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggerReorder = useCallback(() => {
    if (useCartStore.getState().ids.length === 0) return; // 동선 없으면 생략.
    setReordering(true);
    if (reorderTimer.current) clearTimeout(reorderTimer.current);
    reorderTimer.current = setTimeout(() => setReordering(false), 650);
  }, []);
  useEffect(
    () => () => {
      if (reorderTimer.current) clearTimeout(reorderTimer.current);
    },
    [],
  );
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

  // 뒤로가기: 동선을 짜둔 상태면 곧장 나가지 않고 "관람이 끝나셨나요?"를 먼저
  // 묻는다. 동선이 없으면 기존처럼 전시 홈으로.
  function handleBack() {
    if (cartCount > 0) setFinishOpen(true);
    else router.push("/");
  }

  // "예, 끝났어요": 동선 데이터는 유지한 채 완료로 표시(서버 기록)하고 홈으로.
  // 완료 표시는 베스트에포트라 await하지 않는다 — 기다리면 홈 이동이 PATCH 응답만큼
  // 느려진다. 요청만 쏘고 즉시 이동.
  function finishVisit() {
    setFinishOpen(false);
    const r = useRouteStore.getState().route;
    if (r?.id)
      void api
        .patch(`/api/route/${r.id}`, { status: "completed" })
        .catch(() => {});
    router.push("/");
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
  // `compact` (portrait top bar) = icon-only so four actions never overflow and
  // wrap the title. The wide side panel passes false and keeps the labels.
  function renderMapActions(compact = false) {
    const slug = detail.exhibition.slug;
    const cls = compact
      ? "flex size-9 items-center justify-center rounded-full active:bg-secondary"
      : "flex h-11 items-center gap-1 rounded-full px-2 text-sm font-bold active:bg-secondary";
    return (
      <>
        <button
          type="button"
          onClick={() => setNotesOpen(true)}
          aria-label="내 메모장"
          className={cn(cls, "text-muted-foreground")}
        >
          <NotebookPen className="size-5" /> {!compact && "메모장"}
        </button>
        <Link
          href={`/exhibitions/${slug}/routes`}
          aria-label="다른 사람 동선"
          className={cn(cls, "text-muted-foreground")}
        >
          <RouteIcon className="size-5" /> {!compact && "다른 동선"}
        </Link>
        <Link
          href={`/exhibitions/${slug}/community`}
          aria-label="실시간 커뮤니티"
          className={cn(cls, "text-muted-foreground")}
        >
          <MessagesSquare className="size-5" /> {!compact && "커뮤니티"}
        </Link>
        <button
          type="button"
          onClick={() => setAiOpen(true)}
          aria-label="AI 추천받기"
          className={cn(cls, "text-primary")}
        >
          <Sparkles className="size-5" /> {!compact && "AI 추천"}
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
        {cartIds.length > 0 && (
          <FilterChip
            active={activeCat === SELECTED_FILTER}
            onClick={() => setActiveCat(SELECTED_FILTER)}
          >
            선택한 부스 {cartIds.length}
          </FilterChip>
        )}
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
            onChange={(e) => {
              setEntranceId(e.target.value);
              triggerReorder();
            }}
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
            onChange={(e) => {
              setExitId(e.target.value);
              triggerReorder();
            }}
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
          <Star className="size-3.5" /> 관심 {skippedIds.length}
        </StatusChip>
      </>
    );
  }

  function renderList() {
    if (listBooths.length === 0)
      return (
        <EmptyState
          title={
            activeCat === SELECTED_FILTER
              ? "선택한 부스가 없어요"
              : "검색 결과가 없어요"
          }
          description={
            activeCat === SELECTED_FILTER
              ? "부스를 동선에 담으면 여기에 모여요."
              : "다른 키워드나 카테고리로 찾아보세요."
          }
        />
      );
    return (
      <>
        <p className="px-1 pb-1.5 text-xs text-muted-foreground">
          {listBooths.length}개 부스 · 항목을 누르면 지도에서 위치를 보여줘요
        </p>
        <div className="space-y-1.5">
          {listBooths.map((b, i) => (
            <BoothRow
              key={b.id}
              booth={b}
              selected={b.id === selectedId}
              color={
                catById.get(b.categoryId)?.color ?? "var(--muted-foreground)"
              }
              onLocate={locate}
              orderNumber={activeCat === SELECTED_FILTER ? i + 1 : undefined}
            />
          ))}
        </div>
      </>
    );
  }

  // The selected-booth card (info + quick actions). Rendered floating over the
  // map in portrait, and inside the side panel in landscape/desktop so it never
  // covers the tapped booth. Caller guards on `selected` being truthy.
  function renderSelectedCard() {
    if (!selected) return null;
    const b = selected;
    return (
      <div className="rounded-2xl border border-border bg-card p-3 shadow-[var(--shadow-pop)] animate-in slide-in-from-bottom-2">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate font-bold">
              {b.name}
              {b.code && (
                <span className="ml-1.5 text-xs text-muted-foreground">
                  {b.code}
                </span>
              )}
            </p>
            <p className="truncate text-sm text-muted-foreground">
              {b.company}
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {selectedCat && <CategoryChip category={selectedCat} />}
            </div>
          </div>
          <Button asChild size="sm">
            <Link href={`/booths/${b.id}`}>
              상세 <ChevronRight className="size-4" />
            </Link>
          </Button>
        </div>

        <BoothPopupMemo key={b.id} boothId={b.id} />

        <div className="mt-2.5 flex items-center gap-2 border-t border-border pt-2.5">
          <CartButton boothId={b.id} variant="icon" />
          <PopupToggle
            active={selectedStatus === "visited"}
            tone="success"
            onClick={() => toggleStatus(b.id, "visited")}
          >
            <Check className="size-4" /> 방문
          </PopupToggle>
          <PopupToggle
            active={selectedStatus === "skipped"}
            tone="warning"
            onClick={() => toggleStatus(b.id, "skipped")}
          >
            <Star className="size-4" /> 관심
          </PopupToggle>
        </div>
      </div>
    );
  }

  return (
    // The visitor shell boxes pages to max-w-md (mobile frame). The map needs
    // full width on desktop, so break out of that box at md+ with fixed inset-0.
    <div className="flex h-dvh flex-col overflow-hidden overscroll-none bg-background md:fixed md:inset-0 md:z-30 md:flex-row landscape:fixed landscape:inset-0 landscape:z-30 landscape:flex-row">
      {showCoachmark && <MapCoachmark onClose={markMapGuideSeen} />}
      {/* Wide / landscape: always-open side panel (search + filters + list).
          The portrait bottom sheet is hidden here. Selecting in either syncs. */}
      <aside className="relative hidden w-64 shrink-0 flex-col border-r border-border bg-card md:flex md:w-80 landscape:flex">
        <div className="flex items-center gap-1 border-b border-border px-3 py-3">
          <button
            type="button"
            aria-label="전시 홈으로"
            onClick={handleBack}
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
        {/* Everything below search scrolls as one column. In landscape the panel
            is short, so gates + filters would otherwise eat all the height and
            leave the list a 1-row sliver you can't reach — here you just scroll
            down to it. */}
        <div className="min-h-0 flex-1 overflow-y-auto">
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
          <div className="p-3">{renderList()}</div>
        </div>

        {/* Landscape/desktop: tapping a booth covers the side panel with its
            detail (an overlay, not an inline row). Dismiss with the X or by
            tapping the map (which deselects). */}
        {selected && (
          <div className="absolute inset-0 z-30 flex flex-col bg-card animate-in slide-in-from-left-2">
            <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
              <p className="text-sm font-bold text-muted-foreground">
                부스 정보
              </p>
              <button
                type="button"
                aria-label="닫기"
                onClick={() => setSelectedId(null)}
                className="flex size-8 items-center justify-center rounded-full active:bg-secondary"
              >
                <X className="size-5" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {renderSelectedCard()}
            </div>
          </div>
        )}
      </aside>

      {/* Mobile chrome + map column */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Portrait top bar — always visible (landscape/desktop use the panel).
            It stays put during zoom/pan so the map doesn't jump. */}
        <div className="md:hidden landscape:hidden">
          <AppBar
            title="지도"
            onBack={handleBack}
            right={renderMapActions(true)}
          />
        </div>

        <div className="relative flex-1 overflow-hidden">
          {/* 입구/출구 변경 → 동선 재정렬 중 오버레이. 체크한 부스는 그대로,
              순서만 가장 가까운 길로 다시 짜는 동안 잠깐 가린다. */}
          {reordering && (
            <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-background/70 backdrop-blur-sm">
              <Loader2 className="size-7 animate-spin text-primary" />
              <p className="text-sm font-semibold">{reorderMsg}…</p>
              <p className="text-xs text-muted-foreground">
                고른 부스는 그대로, 가장 가까운 순으로 다시 이어볼게
              </p>
            </div>
          )}
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
          {/* Booth color key — the map fills booths by personal state, not
              category. A tiny always-on legend so the three hues are readable
              at a glance (color isn't the only cue: each is labelled). */}
          <div className="pointer-events-none absolute left-1/2 top-3 z-20 flex -translate-x-1/2 items-center gap-2.5 rounded-full border border-border bg-card/90 px-3 py-1.5 text-[11px] font-semibold shadow-[var(--shadow-card)] backdrop-blur">
            {[
              { label: "방문", color: "var(--route-visited)" },
              { label: "관심", color: "var(--warning)" },
              { label: "동선", color: "var(--primary)" },
            ].map((l) => (
              <span key={l.label} className="flex items-center gap-1">
                <span
                  className="size-2.5 rounded-full"
                  style={{ backgroundColor: l.color }}
                />
                {l.label}
              </span>
            ))}
          </div>
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

          {/* selected booth popup — portrait only. Sits above the sheet peek so
              it never hides the tapped booth. Landscape/desktop render the same
              card inside the side panel instead (see <aside> above). */}
          {selected && (
            <div className="absolute inset-x-0 bottom-[100px] z-20 mx-auto w-full max-w-sm px-3 md:hidden landscape:hidden">
              {renderSelectedCard()}
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

      {/* 뒤로가기 확인 — 관람이 끝났는지 묻는다. "아니오"면 지도에 머무르며 상단
          AI 추천으로 동선을 더 받을 수 있다. */}
      {finishOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <button
            type="button"
            aria-label="닫기"
            onClick={() => setFinishOpen(false)}
            className="absolute inset-0 bg-black/40"
          />
          <div className="relative mx-auto w-full max-w-sm rounded-t-2xl border-t border-border bg-card p-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-[var(--shadow-pop)] animate-in slide-in-from-bottom-4 sm:rounded-2xl sm:border">
            <h2 className="text-lg font-extrabold">관람이 끝나셨나요?</h2>
            <p className="mt-1.5 text-sm text-muted-foreground">
              아직이라면 지도로 돌아가 상단 ‘AI 추천’으로 동선을 더 받을 수
              있어요.
            </p>
            <div className="mt-4 flex flex-col gap-2">
              <Button size="lg" onClick={finishVisit}>
                네, 끝났어요
              </Button>
              <Button
                size="lg"
                variant="secondary"
                onClick={() => setFinishOpen(false)}
              >
                아니요, 더 둘러볼게요
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 메모장 — rendered as an overlay on top of the (still-mounted) map, not a
          separate route, so opening/closing is instant: no heavy map remount. */}
      {notesOpen && (
        <NotesView
          slug={detail.exhibition.slug}
          booths={booths}
          categories={detail.categories}
          onClose={() => setNotesOpen(false)}
          onLocate={(id) => {
            setNotesOpen(false);
            locate(id);
          }}
        />
      )}
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
