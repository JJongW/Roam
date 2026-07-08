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
  NotebookPen,
  Search,
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
import { useUiStore } from "@/lib/stores/ui";
import { useHydrated } from "@/lib/hooks/use-hydrated";
import { MapCoachmark } from "@/components/map/map-coachmark";
import { FLOORPLANS } from "@/lib/floorplans";
import { AppBar } from "@/components/common/app-bar";
import { ExhibitionMap, HEAT_TIERS } from "@/components/map/exhibition-map";
import { NotesView } from "@/components/booth/notes-view";
import { CategoryChip } from "@/components/booth/category-chip";
import { EmptyState } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Booth, ExhibitionDetail } from "@/lib/types";

/**
 * One row in the side/sheet booth list. Memoized so that selecting a booth or
 * any map state change re-renders only the rows whose own props changed (the
 * newly + previously selected), not all ~180.
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
    <button
      type="button"
      onClick={() => onLocate(booth.id)}
      className={cn(
        "flex w-full items-center gap-3 rounded-xl border bg-card px-3 py-2.5 text-left",
        selected ? "border-primary" : "border-border",
      )}
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
  const [notesOpen, setNotesOpen] = useState(false);
  // Crowd heatmap (방문객 밀도). Lazy-loaded the first time it's on.
  const [heatOn, setHeatOn] = useState(false);
  const [heat, setHeat] = useState<{
    booths: Record<string, number>;
    pairs: { from: string; to: string; count: number }[];
  } | null>(null);
  const [heatLoading, setHeatLoading] = useState(false);
  const dragStart = useRef<number | null>(null);
  const listDrag = useRef<number | null>(null);

  const hydrated = useHydrated();
  const storeRecords = useVisitStore((s) => s.records);
  const toggleStatus = useVisitStore((s) => s.toggleStatus);
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

  // Defer the search term so typing stays instant.
  const deferredQuery = useDeferredValue(query);
  const filtered = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
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
  }, [booths, activeCat, statusFilter, visitedSet, skippedSet, deferredQuery]);

  const selected = booths.find((b) => b.id === selectedId) ?? null;
  const selectedCat = selected ? catById.get(selected.categoryId) : undefined;
  const selectedStatus = selected ? records[selected.id]?.status : undefined;

  const locate = useCallback((id: string) => {
    setSelectedId(id);
    setCenterOn(id);
    setSheetOpen(false);
  }, []);

  // 뒤로가기: 전시 홈으로.
  function handleBack() {
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
            toast("아직 밀도 데이터가 쌓이는 중이에요");
        })
        .catch(() => toast.error("밀도 정보를 불러오지 못했어요"))
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
          href={`/exhibitions/${slug}/community`}
          aria-label="실시간 커뮤니티"
          className={cn(cls, "text-muted-foreground")}
        >
          <MessagesSquare className="size-5" /> {!compact && "커뮤니티"}
        </Link>
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
        {heatLoading ? "밀도 부르는 중" : "관심 밀도"}
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

  // The selected-booth card (info + quick actions). 저장(cart) 대신 방문/관심 반응.
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
    <div className="flex h-dvh flex-col overflow-hidden overscroll-none bg-background md:fixed md:inset-0 md:z-30 md:flex-row landscape:fixed landscape:inset-0 landscape:z-30 landscape:flex-row">
      {showCoachmark && <MapCoachmark onClose={markMapGuideSeen} />}
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
        <div className="min-h-0 flex-1 overflow-y-auto">
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
        <div className="md:hidden landscape:hidden">
          <AppBar title="지도" onBack={handleBack} right={renderMapActions(true)} />
        </div>

        <div className="relative flex-1 overflow-hidden">
          {heatOn && (
            <div className="pointer-events-none absolute left-3 top-3 z-20 flex flex-col gap-1 rounded-xl border border-border bg-card/90 px-2.5 py-2 text-[11px] font-semibold shadow-[var(--shadow-card)] backdrop-blur">
              <span className="text-muted-foreground">관심 밀도</span>
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
          {/* Booth color key — the map fills booths by personal state. */}
          <div className="pointer-events-none absolute left-1/2 top-3 z-20 flex -translate-x-1/2 items-center gap-2.5 rounded-full border border-border bg-card/90 px-3 py-1.5 text-[11px] font-semibold shadow-[var(--shadow-card)] backdrop-blur">
            {[
              { label: "방문", color: "var(--route-visited)" },
              { label: "관심", color: "var(--warning)" },
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
            booths={filtered}
            categories={detail.categories}
            halls={detail.halls}
            floorplan={FLOORPLANS[detail.exhibition.slug]}
            fillHeight
            viewportClassName="inset-x-0 top-0 bottom-[92px] md:inset-0 landscape:inset-0"
            controlsClassName={
              selected
                ? "top-3 right-3"
                : "bottom-[100px] right-3 md:bottom-4 landscape:bottom-4"
            }
            visitedIds={visitedIds}
            skippedIds={skippedIds}
            selectedId={selectedId}
            centerOn={centerOn}
            focusBottomInset={320}
            heat={heatOn ? heat?.booths : undefined}
            heatPairs={heatOn ? heat?.pairs : undefined}
            onSelect={(id) => {
              setSelectedId(id);
              if (id) setSheetOpen(false);
            }}
            onInteractStart={() => setSheetOpen(false)}
          />

          {selected && (
            <div className="absolute inset-x-0 bottom-[100px] z-20 mx-auto w-full max-w-sm px-3 md:hidden landscape:hidden">
              {renderSelectedCard()}
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

            <div
              className="px-4 pb-2"
              onPointerDown={() => !sheetOpen && setSheetOpen(true)}
            >
              {renderSearch()}
            </div>

            {sheetOpen && (
              <div
                className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4"
                onPointerDown={(e) => {
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

      {/* 메모장 — overlay on top of the (still-mounted) map. */}
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
 * Inline memo for the map popup — jot a quick note the moment you tap a booth.
 * Local-first; signing in syncs it. Keyed by boothId so it resets per booth.
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
