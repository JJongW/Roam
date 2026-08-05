"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  Flame,
  Loader2,
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
import { useCompanionStore } from "@/lib/stores/companion";
import { useHydrated } from "@/lib/hooks/use-hydrated";
import { MapCoachmark } from "@/components/map/map-coachmark";
import { FLOORPLANS } from "@/lib/floorplans";
import { ExhibitionMap, HEAT_TIERS } from "@/components/map/exhibition-map";
import { CategoryChip } from "@/components/booth/category-chip";
import { ReactionBar } from "@/components/feed/reaction-bar";
import { VisitedRetroInline } from "@/components/map/visited-retro-inline";
import { ValueChips } from "@/components/values/value-chips";
import { RoamAvatar } from "@/components/companion/roam-avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useT } from "@/lib/i18n/provider";
import { boothValueSlugs } from "@/lib/values";
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
  const t = useT();
  const [selectedId, setSelectedId] = useState<string | null>(
    initialFocusId ?? null,
  );
  // 딥링크(메모장 "지도에서 보기") 전용 — 진입 시 한 번 중앙 정렬하고 이후 안 바뀐다.
  const centerOn = initialFocusId ?? null;
  // Crowd heatmap (관심 밀도). Lazy-loaded the first time it's on.
  const [heatOn, setHeatOn] = useState(false);
  const [heat, setHeat] = useState<{
    booths: Record<string, number>;
    pairs: { from: string; to: string; count: number }[];
  } | null>(null);
  const [heatLoading, setHeatLoading] = useState(false);

  // 반응 즉답(로미 발화) — companion-bar는 지도에서 숨겨지므로(자체 전체화면 UI)
  // 여기서 flash를 구독해 토스트로 띄운다. 안 그러면 지도에서 끌림/별로를 눌러도
  // 아무 반응이 없어 "내 반응이 아무것도 안 바꾼다"고 느껴진다.
  const flash = useCompanionStore((s) => s.flash);
  const clearFlash = useCompanionStore((s) => s.clearFlash);
  useEffect(() => {
    if (!flash) return;
    toast(flash, { icon: <RoamAvatar className="size-5" /> });
    clearFlash();
  }, [flash, clearFlash]);

  const hydrated = useHydrated();
  const storeRecords = useVisitStore((s) => s.records);
  const records = useMemo(
    () => (hydrated ? storeRecords : {}),
    [hydrated, storeRecords],
  );
  const visitedIds = useMemo(() => idsByStatus(records, "visited"), [records]);
  const skippedIds = useMemo(() => idsByStatus(records, "skipped"), [records]);
  const laterIds = useMemo(() => idsByStatus(records, "later"), [records]);
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
      toast(t("map.rotateHint"));
    }
    markLandscapeHintSeen();
  }, [hydrated, showCoachmark, landscapeHintSeen, markLandscapeHintSeen]);

  const catById = useMemo(
    () => new Map(detail.categories.map((c) => [c.id, c])),
    [detail.categories],
  );
  const selected = booths.find((b) => b.id === selectedId) ?? null;
  const selectedCat = selected ? catById.get(selected.categoryId) : undefined;


  function handleBack() {
    // 지도는 전시 상세에서 들어온 부가 화면 — 홈이 아니라 그 전시로 돌아간다.
    // history가 있으면 back()으로 pop → Next Router Cache에서 전시 페이지를 복원해
    // 즉시 돌아간다(push는 새 내비라 RSC/데이터를 매번 다시 불러와 느림). 공유 링크로
    // 지도에 바로 진입해 history가 없을 때만 전시로 push.
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push(`/exhibitions/${detail.exhibition.slug}`);
    }
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
            toast(t("map.densityBuilding"));
        })
        .catch(() => toast.error(t("map.densityFailed")))
        .finally(() => setHeatLoading(false));
    }
  }

  return (
    <div className="relative h-dvh w-full overflow-hidden overscroll-none bg-background">
      {showCoachmark && (
        <MapCoachmark onClose={markMapGuideSeen} />
      )}

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
        controlsClassName="right-3 top-20 mt-safe"
        visitedIds={visitedIds}
        skippedIds={skippedIds}
        laterIds={laterIds}
        interestedIds={interestedIds}
        selectedId={selectedId}
        centerOn={centerOn}
        focusBottomInset={320}
        heat={heatOn ? heat?.booths : undefined}
        heatPairs={heatOn ? heat?.pairs : undefined}
        onSelect={(id) => setSelectedId(id)}
      />

      {/* 지도 화면은 거의 지도만이어야 한다 — 상단바가 있으면 현장에서 방향을 잡기
          전에 앱 chrome이 먼저 보인다(ai-companion-ux-writing-patterns.md §379).
          그래서 뒤로가기 하나만 좌상단에 띄운다. 밀도·메모는 전시 홈에서 들어오고,
          지도 사용법은 첫 진입 시 코치마크가 알아서 뜬다.
          6/24 결정("상단바 고정")이 막으려던 건 상단바가 **접혔다 펴지며** 지도
          컨테이너 크기를 바꿔 확대·축소가 튀는 것이었다. 여기선 아예 없애므로
          크기가 변할 일이 없다 — 그 문제는 재발하지 않는다. */}
      <button
        type="button"
        aria-label={t("map.back")}
        onClick={handleBack}
        className="absolute left-3 top-3 z-30 flex size-10 items-center justify-center rounded-full bg-card shadow-[var(--shadow-card)] active:bg-secondary mt-safe"
      >
        <ChevronLeft className="size-5" />
      </button>

      {/* 밀도 토글 — 지도 위에 떠 있는 독립 필. 우측 컨트롤 4개(회전·확대·축소·전체)
          클러스터와는 분리해 둔다(같은 묶음이 되면 "컨트롤 5개"가 되어 문서 규칙과
          어긋난다). 지도 상태를 바꾸는 버튼이라 지도를 떠날 수 없다. */}
      <button
        type="button"
        onClick={toggleHeat}
        aria-pressed={heatOn}
        className={cn(
          "absolute right-3 top-3 z-30 mt-safe inline-flex items-center gap-1 rounded-full border px-3 py-2 text-sm font-semibold shadow-[var(--shadow-card)]",
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
        {heatLoading ? t("map.densityShort") : t("map.density")}
      </button>

      {/* 상시 범례 — 색만으로 상태 못 읽는 걸 막는다(끌림·가봄·나중에·별로·선택). 밀도 켜면
          밀도 범례가 이 자리를 대신하므로 그때만 숨김. */}
      {!heatOn && (
        <div className="pointer-events-none absolute left-3 top-16 z-20 flex flex-col gap-1 rounded-xl border border-border bg-card/90 px-2.5 py-2 text-[11px] font-semibold shadow-[var(--shadow-card)] backdrop-blur">
          <span className="flex items-center gap-1.5">
            <span
              className="size-3 rounded-[3px]"
              style={{ backgroundColor: "var(--route-visited)" }}
            />
            {t("map.legendInterested")}
          </span>
          <span className="flex items-center gap-1.5">
            <span
              className="size-3 rounded-[3px]"
              style={{ backgroundColor: "var(--primary)" }}
            />
            {t("map.legendVisited")}
          </span>
          <span className="flex items-center gap-1.5">
            <span
              className="size-3 rounded-[3px]"
              style={{ backgroundColor: "var(--warning)" }}
            />
            {t("map.legendLater")}
          </span>
          <span className="flex items-center gap-1.5">
            <span
              className="size-3 rounded-[3px] border"
              style={{
                backgroundColor: "var(--booth-skipped)",
                borderColor: "var(--booth-skipped-stroke)",
              }}
            />
            {t("map.legendSkipped")}
          </span>
          <span className="flex items-center gap-1.5">
            <span
              className="size-3 rounded-[3px] border-2"
              style={{ borderColor: "var(--primary)" }}
            />
            {t("map.legendSelected")}
          </span>
        </div>
      )}

      {/* 관심 밀도 범례 */}
      {heatOn && (
        <div className="pointer-events-none absolute left-3 top-16 z-20 flex flex-col gap-1 rounded-xl border border-border bg-card/90 px-2.5 py-2 text-[11px] font-semibold shadow-[var(--shadow-card)] backdrop-blur">
          <span className="text-muted-foreground">{t("map.density")}</span>
          <div className="flex items-center gap-2">
            {HEAT_TIERS.map((tier) => (
              <span key={tier.key} className="flex items-center gap-1">
                <span
                  className="size-3 rounded-[3px]"
                  style={{ backgroundColor: tier.fill }}
                />
                {t(`map.${tier.i18nKey}`)}
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
                {/* prefetch — 시트를 읽는 1~2초 사이에 상세를 미리 받아둔다. 기본값은
                    로딩 경계까지만 받아서, 탭하면 그때부터 서버 왕복이 시작됐다. */}
                <Link href={`/booths/${selected.id}`} prefetch>
                  {t("common.detail")} <ChevronRight className="size-4" />
                </Link>
              </Button>
              <button
                type="button"
                aria-label={t("common.close")}
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
              <ReactionBar
                boothId={selected.id}
                boothName={selected.name}
                interestSlugs={boothValueSlugs(selected)}
                categoryLabel={selectedCat?.name}
              />
            </div>

            <VisitedRetroInline boothId={selected.id} />
          </div>
        </div>
      )}

      {/* 메모장 — overlay on top of the (still-mounted) map. */}
    </div>
  );
}

/**
 * Inline memo for the map popup — jot a quick note the moment you tap a booth.
 * Local-first; signing in syncs it. Keyed by boothId so it resets per booth.
 */
function BoothPopupMemo({ boothId }: { boothId: string }) {
  const t = useT();
  const user = useAuthStore((s) => s.user);
  const initial = useVisitStore((s) => s.records[boothId]?.memo ?? "");
  const setMemo = useVisitStore((s) => s.setMemo);
  const [value, setValue] = useState(initial);

  function save() {
    if (value.trim() === initial.trim()) return;
    setMemo(boothId, value.trim());
    if (user) void pushNote(boothId);
    toast.success(value.trim() ? t("map.memoSaved") : t("map.memoCleared"));
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
          placeholder={t("map.memoPlaceholder")}
          maxLength={100}
          aria-label={t("map.memoAria")}
          className="h-9 pl-8 text-sm"
        />
      </div>
      <NotePhotos boothId={boothId} compact />
    </div>
  );
}
