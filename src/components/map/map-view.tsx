"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  Flame,
  Loader2,
  MessagesSquare,
  NotebookPen,
  X,
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
import { ExhibitionMap, HEAT_TIERS } from "@/components/map/exhibition-map";
import { NotesView } from "@/components/booth/notes-view";
import { CategoryChip } from "@/components/booth/category-chip";
import { ReactionBar } from "@/components/feed/reaction-bar";
import { ValueChips } from "@/components/values/value-chips";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Booth, ExhibitionDetail } from "@/lib/types";

/**
 * 관심 밀도 지도 — 길찾기·동선이 아니라 온사이트 공간 참조 부가 서비스. 검색·리스트·
 * 사이드바는 전부 앞단(피드)에서 해결하고, 여기선 전체화면 지도 + 뒤로가기 + 부스 선택
 * 카드(반응 버튼) + 관심 밀도 히트맵만 둔다(companion-reframe: 지도 = 부가).
 */
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
  const [selectedId, setSelectedId] = useState<string | null>(
    initialFocusId ?? null,
  );
  const [centerOn, setCenterOn] = useState<string | null>(
    initialFocusId ?? null,
  );
  const [notesOpen, setNotesOpen] = useState(false);
  // Crowd heatmap (관심 밀도). Lazy-loaded the first time it's on.
  const [heatOn, setHeatOn] = useState(false);
  const [heat, setHeat] = useState<{
    booths: Record<string, number>;
    pairs: { from: string; to: string; count: number }[];
  } | null>(null);
  const [heatLoading, setHeatLoading] = useState(false);

  const hydrated = useHydrated();
  const storeRecords = useVisitStore((s) => s.records);
  const records = useMemo(
    () => (hydrated ? storeRecords : {}),
    [hydrated, storeRecords],
  );
  const visitedIds = useMemo(() => idsByStatus(records, "visited"), [records]);
  const skippedIds = useMemo(() => idsByStatus(records, "skipped"), [records]);
  const interestedIds = useMemo(
    () => idsByStatus(records, "interested"),
    [records],
  );

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

  const catById = useMemo(
    () => new Map(detail.categories.map((c) => [c.id, c])),
    [detail.categories],
  );
  const selected = booths.find((b) => b.id === selectedId) ?? null;
  const selectedCat = selected ? catById.get(selected.categoryId) : undefined;

  const locate = useCallback((id: string) => {
    setSelectedId(id);
    setCenterOn(id);
  }, []);

  function handleBack() {
    // 지도는 전시 상세에서 들어온 부가 화면 — 홈이 아니라 그 전시로 돌아간다.
    router.push(`/exhibitions/${detail.exhibition.slug}`);
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
          if (Object.keys(d.booths).length === 0)
            toast("아직 밀도 데이터가 쌓이는 중이에요");
        })
        .catch(() => toast.error("밀도 정보를 불러오지 못했어요"))
        .finally(() => setHeatLoading(false));
    }
  }

  return (
    <div className="relative h-dvh w-full overflow-hidden overscroll-none bg-background">
      {showCoachmark && <MapCoachmark onClose={markMapGuideSeen} />}

      {/* 전체화면 지도 */}
      <ExhibitionMap
        width={detail.exhibition.mapWidth}
        height={detail.exhibition.mapHeight}
        booths={booths}
        categories={detail.categories}
        halls={detail.halls}
        floorplan={FLOORPLANS[detail.exhibition.slug]}
        fillHeight
        viewportClassName="inset-0"
        controlsClassName="right-3 top-16"
        visitedIds={visitedIds}
        skippedIds={skippedIds}
        interestedIds={interestedIds}
        selectedId={selectedId}
        centerOn={centerOn}
        focusBottomInset={320}
        heat={heatOn ? heat?.booths : undefined}
        heatPairs={heatOn ? heat?.pairs : undefined}
        onSelect={(id) => setSelectedId(id)}
      />

      {/* 상단 크롬: 뒤로가기 + 관심 밀도 + 메모/커뮤니티 */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-center gap-2 bg-gradient-to-b from-background/85 to-transparent px-3 pb-4 pt-safe">
        <button
          type="button"
          aria-label="전시로 돌아가기"
          onClick={handleBack}
          className="pointer-events-auto flex size-10 items-center justify-center rounded-full bg-card shadow-[var(--shadow-card)] active:bg-secondary"
        >
          <ChevronLeft className="size-5" />
        </button>
        <h1 className="text-base font-extrabold">전시장 지도</h1>
        <div className="pointer-events-auto ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={toggleHeat}
            aria-pressed={heatOn}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-sm font-semibold shadow-[var(--shadow-card)]",
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
            {heatLoading ? "밀도…" : "관심 밀도"}
          </button>
          <button
            type="button"
            onClick={() => setNotesOpen(true)}
            aria-label="내 메모장"
            className="flex size-10 items-center justify-center rounded-full bg-card text-muted-foreground shadow-[var(--shadow-card)] active:bg-secondary"
          >
            <NotebookPen className="size-5" />
          </button>
          <Link
            href={`/exhibitions/${detail.exhibition.slug}/community`}
            aria-label="실시간 커뮤니티"
            className="flex size-10 items-center justify-center rounded-full bg-card text-muted-foreground shadow-[var(--shadow-card)] active:bg-secondary"
          >
            <MessagesSquare className="size-5" />
          </Link>
        </div>
      </div>

      {/* 관심 밀도 범례 */}
      {heatOn && (
        <div className="pointer-events-none absolute left-3 top-16 z-20 flex flex-col gap-1 rounded-xl border border-border bg-card/90 px-2.5 py-2 text-[11px] font-semibold shadow-[var(--shadow-card)] backdrop-blur">
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

      {/* 선택 부스 카드 (하단) — 반응 버튼 */}
      {selected && (
        <div className="absolute inset-x-0 bottom-4 z-30 mx-auto w-full max-w-md px-3 pb-safe">
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
              <button
                type="button"
                aria-label="닫기"
                onClick={() => setSelectedId(null)}
                className="flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground active:bg-secondary"
              >
                <X className="size-5" />
              </button>
            </div>

            {selected.valueTags && selected.valueTags.length > 0 && (
              <div className="mt-2 border-t border-border pt-2.5">
                <ValueChips tags={selected.valueTags} />
              </div>
            )}

            <BoothPopupMemo key={selected.id} boothId={selected.id} />

            {/* 저장 대신 반응 — 끌림/나중에/별로/이미봄 → 신호로 브레인에 반영. */}
            <div className="mt-2.5 border-t border-border pt-2.5">
              <ReactionBar boothId={selected.id} />
            </div>
          </div>
        </div>
      )}

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
