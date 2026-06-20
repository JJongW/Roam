"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Check,
  ChevronRight,
  ChevronLeft,
  Clock3,
  Layers,
  Search,
  Sparkles,
  X,
  MapPin,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useVisitStore, idsByStatus } from "@/lib/stores/visit";
import { useCartStore } from "@/lib/stores/cart";
import { useHydrated } from "@/lib/hooks/use-hydrated";
import { FLOORPLANS } from "@/lib/floorplans";
import { CartButton } from "@/components/booth/cart-button";
import { Route as RouteIcon } from "lucide-react";
import { AppBar } from "@/components/common/app-bar";
import { ExhibitionMap } from "@/components/map/exhibition-map";
import { ScreenshotCapture } from "@/components/map/screenshot-capture";
import { SwipeDeck } from "@/components/map/swipe-deck";
import { CategoryChip } from "@/components/booth/category-chip";
import { WaitingBadge } from "@/components/booth/waiting-badge";
import { EmptyState } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Booth, ExhibitionDetail, Waiting } from "@/lib/types";

export function MapView({
  detail,
  booths,
  waitings,
  aiEnabled = false,
}: {
  detail: ExhibitionDetail;
  booths: Booth[];
  waitings: Record<string, Waiting>;
  aiEnabled?: boolean;
}) {
  const router = useRouter();
  const [activeCat, setActiveCat] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<
    "visited" | "skipped" | null
  >(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [centerOn, setCenterOn] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [swipeOpen, setSwipeOpen] = useState(false);
  // pointer tracking for drag-to-toggle on the sheet handle
  const dragStart = useRef<number | null>(null);

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

  const selected = booths.find((b) => b.id === selectedId) ?? null;
  const selectedCat = selected ? catById.get(selected.categoryId) : undefined;
  const selectedStatus = selected ? records[selected.id]?.status : undefined;

  // Select a booth from the list/search: mark it, recentre the map on it, and
  // collapse the (mobile) sheet so the map is visible.
  function locate(id: string) {
    setSelectedId(id);
    setCenterOn(id);
    setSheetOpen(false);
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

  function renderSearch() {
    return (
      // Search is the default input. 캡처(스크린샷 판독) sits beside it as a
      // secondary path so visitors aren't faced with a 4-way choice up front.
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
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
        {aiEnabled && (
          <ScreenshotCapture
            slug={detail.exhibition.slug}
            categories={detail.categories}
            waitings={waitings}
          />
        )}
        {/* Swipe = separate lightweight discovery (not the recommendation entry). */}
        <button
          type="button"
          aria-label="부스 휙휙 둘러보기"
          onClick={() => setSwipeOpen(true)}
          className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground transition-colors active:bg-accent/40"
        >
          <Layers className="size-4.5" />
        </button>
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
            <div
              key={b.id}
              className={cn(
                "flex items-center gap-3 rounded-xl border bg-card px-3 py-2.5",
                b.id === selectedId ? "border-primary" : "border-border",
              )}
            >
              <button
                type="button"
                onClick={() => locate(b.id)}
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
              >
                <MapPin
                  className="size-4 shrink-0"
                  style={{
                    color:
                      catById.get(b.categoryId)?.color ??
                      "var(--muted-foreground)",
                  }}
                />
                {b.code && (
                  <span className="w-12 shrink-0 text-xs font-bold text-muted-foreground">
                    {b.code}
                  </span>
                )}
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                  {b.name}
                </span>
                <WaitingBadge waiting={waitings[b.id]} />
              </button>
              <CartButton boothId={b.id} variant="icon" />
            </div>
          ))}
        </div>
      </>
    );
  }

  return (
    // The visitor shell boxes pages to max-w-md (mobile frame). The map needs
    // full width on desktop, so break out of that box at md+ with fixed inset-0.
    <div className="flex h-dvh flex-col overflow-hidden md:fixed md:inset-0 md:z-30 md:flex-row md:bg-background">
      <SwipeDeck
        slug={detail.exhibition.slug}
        booths={booths}
        categories={detail.categories}
        open={swipeOpen}
        onClose={() => setSwipeOpen(false)}
      />
      {/* Desktop: always-open side panel (search + filters + list). The mobile
          bottom sheet is hidden at md+. Selecting in either highlights both. */}
      <aside className="hidden w-96 shrink-0 flex-col border-r border-border bg-card md:flex">
        <div className="flex items-center gap-1 border-b border-border px-3 py-3">
          <button
            type="button"
            aria-label="뒤로 가기"
            onClick={() => router.back()}
            className="flex size-9 items-center justify-center rounded-full hover:bg-secondary"
          >
            <ChevronLeft className="size-5" />
          </button>
          <h1 className="text-lg font-extrabold">전시장 지도</h1>
        </div>
        <div className="border-b border-border p-3">{renderSearch()}</div>
        <div className="no-scrollbar flex gap-1.5 overflow-x-auto border-b border-border px-3 py-2.5">
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
        {/* In landscape (and on desktop) the mobile chrome hides. */}
        <div className="md:hidden landscape:hidden">
          <AppBar title="전시장 지도" />

          <div className="no-scrollbar flex gap-1.5 overflow-x-auto border-b border-border px-4 py-2.5">
            {renderCategoryChips()}
          </div>

          {hasStatus && (
            <div className="no-scrollbar flex gap-1.5 overflow-x-auto border-b border-border px-4 py-2">
              {renderStatusChips()}
            </div>
          )}
        </div>

        <div className="relative flex-1 overflow-hidden">
          {/* landscape hides the AppBar, so float a back button over the map */}
          <button
            type="button"
            aria-label="뒤로 가기"
            onClick={() => router.back()}
            className="absolute left-3 top-3 z-40 hidden size-10 items-center justify-center rounded-full border border-border bg-card shadow-[var(--shadow-card)] landscape:flex md:landscape:hidden"
          >
            <ChevronLeft className="size-6" />
          </button>

          <ExhibitionMap
            width={detail.exhibition.mapWidth}
            height={detail.exhibition.mapHeight}
            booths={filtered}
            categories={detail.categories}
            halls={detail.halls}
            floorplan={FLOORPLANS[detail.exhibition.slug]}
            fillHeight
            // Mobile portrait: keep the fit/pan area above the bottom-sheet peek
            // (~116px) so the bottom of the venue isn't clipped behind it.
            // Desktop (side panel) and landscape have no sheet → fill fully.
            viewportClassName="inset-x-0 top-0 bottom-[116px] md:inset-0 landscape:inset-0"
            visitedIds={visitedIds}
            skippedIds={skippedIds}
            selectedId={selectedId}
            centerOn={centerOn}
            onSelect={(id) => {
              setSelectedId(id);
              if (id) setSheetOpen(false);
            }}
            onInteractStart={() => setSheetOpen(false)}
          />

          {/* selected booth popup — decision info + quick actions. Sits above
              the sheet peek on mobile; bottom-right card on desktop. */}
          {selected && (
            <div className="absolute inset-x-0 bottom-[124px] z-20 mx-auto w-full max-w-md p-3 md:inset-x-auto md:bottom-3 md:right-3 md:w-80 landscape:bottom-3">
              <div className="rounded-2xl border border-border bg-card p-3.5 shadow-[var(--shadow-pop)] animate-in slide-in-from-bottom-2">
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
                      <WaitingBadge waiting={waitings[selected.id]} />
                    </div>
                  </div>
                  <Button asChild size="sm">
                    <Link href={`/booths/${selected.id}`}>
                      상세 <ChevronRight className="size-4" />
                    </Link>
                  </Button>
                </div>

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

          {/* 동선 만들기 — even 1 booth is enough. Hidden in landscape and when
              a booth card is showing. */}
          {hydrated && cartCount > 0 && !selected && (
            <Link
              href={`/exhibitions/${detail.exhibition.slug}/route`}
              className="absolute inset-x-0 bottom-[132px] z-20 mx-auto flex w-fit items-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-bold text-primary-foreground shadow-[var(--shadow-pop)] md:inset-x-auto md:bottom-4 md:right-4 landscape:hidden md:landscape:flex"
            >
              <RouteIcon className="size-4.5" /> 내 동선 {cartCount}개 · 동선
              만들기
            </Link>
          )}

          {/* Low-involvement escape hatch: picked nothing → "골라드릴까요?" opens
              the context recommendation (who/interests/why → Gemini). Replaced by
              동선 만들기 once cart ≥ 1. Swipe lives separately (search row). */}
          {hydrated && cartCount === 0 && !selected && (
            <Link
              href={`/exhibitions/${detail.exhibition.slug}/onboarding`}
              className="absolute inset-x-0 bottom-[132px] z-20 mx-auto flex w-fit items-center gap-2 rounded-full border border-border bg-card px-5 py-3 text-sm font-bold shadow-[var(--shadow-pop)] md:inset-x-auto md:bottom-4 md:right-4 landscape:hidden md:landscape:flex"
            >
              <Sparkles className="size-4.5 text-primary" /> 뭘 담을지
              모르겠어요 · 골라드릴까요?
            </Link>
          )}

          {/* bottom sheet: search + booth list. Mobile only (md:hidden). */}
          <div
            className={cn(
              "absolute inset-x-0 bottom-0 z-30 flex flex-col rounded-t-2xl border-t border-border bg-card shadow-[var(--shadow-pop)] transition-[height] duration-300 ease-out md:hidden landscape:hidden",
              sheetOpen ? "h-[60dvh]" : "h-[116px]",
            )}
          >
            <button
              type="button"
              aria-label={sheetOpen ? "목록 접기" : "목록 펼치기"}
              className="flex w-full shrink-0 cursor-grab touch-none justify-center py-2.5 active:cursor-grabbing"
              onPointerDown={(e) => (dragStart.current = e.clientY)}
              onPointerUp={onHandleUp}
            >
              <span className="h-1.5 w-10 rounded-full bg-border" />
            </button>

            <div className="px-4 pb-2">{renderSearch()}</div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-1">
              {renderList()}
            </div>
          </div>
        </div>
      </div>
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
