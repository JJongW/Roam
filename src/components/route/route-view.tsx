"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Reorder, useDragControls } from "framer-motion";
import {
  MapPin,
  Navigation,
  Sparkles,
  Plus,
  Footprints,
  GripVertical,
  ArrowDownNarrowWide,
  Wand2,
  Loader2,
  Clock,
  Check,
  Eye,
  X,
  LogIn,
  LogOut,
} from "lucide-react";
import {
  BASE_DWELL_MINUTES,
  MOVEMENT_OPTIONS,
  TIME_OPTIONS,
  VISIT_PURPOSE_OPTIONS,
} from "@/lib/constants";
import { toast } from "sonner";
import { api, ApiClientError } from "@/lib/api/client";
import { cn, formatWalk } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { useRouteStore } from "@/lib/stores/route";
import { useCartStore } from "@/lib/stores/cart";
import { useOnboardingStore } from "@/lib/stores/onboarding";
import { useVisitStore, idsByStatus } from "@/lib/stores/visit";
import { useHydrated } from "@/lib/hooks/use-hydrated";
import { buildManualRoute, buildOrderedRoute } from "@/lib/engine/route";
import { FLOORPLANS } from "@/lib/floorplans";
import { AppBar } from "@/components/common/app-bar";
import { SaveRouteButton } from "@/components/route/save-route-sheet";
import { ShareRouteButton } from "@/components/route/share-route-sheet";
import { MyRoutesSheet } from "@/components/route/my-routes-sheet";
import { EmptyState } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { ExhibitionMap } from "@/components/map/exhibition-map";
import type {
  Booth,
  Category,
  Exhibition,
  Hall,
  Point,
  RoutePlan,
} from "@/lib/types";

export function RouteView({
  slug,
  exhibition,
  booths,
  categories,
  halls,
  aiEnabled = false,
}: {
  slug: string;
  exhibition: Exhibition;
  booths: Booth[];
  categories: Category[];
  halls: Hall[];
  aiEnabled?: boolean;
}) {
  const hydrated = useHydrated();
  const cartIds = useCartStore((s) => s.ids);
  const setCartIds = useCartStore((s) => s.setIds);
  const removeFromCart = useCartStore((s) => s.remove);
  const setRoute = useRouteStore((s) => s.setRoute);
  const interests = useOnboardingStore((s) => s.interests);
  const visitPurposes = useOnboardingStore((s) => s.visitPurposes);
  const availableMinutes = useOnboardingStore((s) => s.availableMinutes);
  const movementPreference = useOnboardingStore((s) => s.movementPreference);
  const records = useVisitStore((s) => s.records);
  const toggleStatus = useVisitStore((s) => s.toggleStatus);
  const skippedIds = useMemo(() => idsByStatus(records, "skipped"), [records]);
  const skippedSet = useMemo(() => new Set(skippedIds), [skippedIds]);
  const visitedIds = useMemo(() => idsByStatus(records, "visited"), [records]);
  const visitedSet = useMemo(() => new Set(visitedIds), [visitedIds]);
  // 관람 모드: enlarge the map + drop the editing chrome for a clean walking view.
  const [viewing, setViewing] = useState(false);

  const boothById = useMemo(
    () => new Map(booths.map((b) => [b.id, b])),
    [booths],
  );

  // Visitor-chosen entrance / exit. The route sweep starts at the entrance and
  // the drawn path ends at the exit; defaults to the floorplan's own gates.
  const fp = FLOORPLANS[slug];
  const gates = fp?.gates ?? [];
  const fallbackStart: Point = fp?.entrance ?? {
    x: Math.round(exhibition.mapWidth / 2),
    y: exhibition.mapHeight,
  };
  const [entranceId, setEntranceId] = useState<string>(
    () =>
      gates.find((g) => g.x === fp?.entrance?.x && g.y === fp?.entrance?.y)
        ?.id ??
      gates[0]?.id ??
      "",
  );
  const [exitId, setExitId] = useState<string>(
    () =>
      gates.find((g) => g.x === fp?.exit?.x && g.y === fp?.exit?.y)?.id ??
      gates[gates.length - 1]?.id ??
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

  // The active route = chosen booths in cart order, MINUS the ones already
  // viewed (관람함). Marking a booth visited drops it from the 동선 and the screen
  // re-plans around what's left. Drag to rearrange / "거리순 정렬" to re-sweep.
  const chosen = useMemo(
    () =>
      (hydrated ? cartIds : [])
        .map((id) => boothById.get(id))
        .filter((b): b is Booth => b != null && !visitedSet.has(b.id)),
    [hydrated, cartIds, boothById, visitedSet],
  );
  // "이따 다시"로 표시한 부스는 동선의 뒤로 미룬다(나머지 순서는 유지) — 지금
  // 바로 안 볼 곳을 자동으로 후순위에. 단순 재배치라 LLM 없이 결정적으로 처리.
  const ordered = useMemo(() => {
    const keep = chosen.filter((b) => !skippedSet.has(b.id));
    const later = chosen.filter((b) => skippedSet.has(b.id));
    return [...keep, ...later];
  }, [chosen, skippedSet]);
  const plan = useMemo(
    () => buildOrderedRoute(ordered, start),
    [ordered, start],
  );
  const orderedIds = useMemo(() => ordered.map((b) => b.id), [ordered]);

  // A short, deterministic "왜 이렇게 짰는지" line — built from the visitor's own
  // preferences + the route, so it costs no LLM call (and explains the picks).
  const rationale = useMemo<string | null>(() => {
    if (!hydrated || ordered.length === 0) return null;
    const names = interests
      .map((slug) => categories.find((c) => c.slug === slug)?.name)
      .filter((n): n is string => Boolean(n));
    const purposeLabel = VISIT_PURPOSE_OPTIONS.filter((o) =>
      visitPurposes.includes(o.value),
    )
      .map((o) => o.label)
      .join("·");
    const timeLabel = availableMinutes
      ? (TIME_OPTIONS.find((o) => o.value === availableMinutes)?.label ??
        `${Math.round(availableMinutes / 60)}시간`)
      : null;
    const moveLabel = MOVEMENT_OPTIONS.find(
      (o) => o.value === movementPreference,
    )?.label;
    const popular = ordered.filter((b) => b.popularity >= 70).length;

    const lead = names.length
      ? `관심 분야 ${names.slice(0, 3).join("·")}`
      : "담은 부스";
    const cond = [
      purposeLabel ? `${purposeLabel} 목적` : null,
      timeLabel ? `약 ${timeLabel} 코스` : null,
    ].filter(Boolean);
    let s = `${lead}에 맞춰 ${cond.length ? cond.join(" · ") + "로 " : ""}${ordered.length}곳을 골랐어요.`;
    const extra = [
      popular > 0 ? `인기 부스 ${popular}곳` : null,
      moveLabel ? `${moveLabel} 동선` : null,
    ].filter(Boolean);
    if (extra.length) s += ` ${extra.join(", ")} 포함.`;
    return s;
  }, [
    hydrated,
    ordered,
    interests,
    categories,
    visitPurposes,
    availableMinutes,
    movementPreference,
  ]);

  // Natural-language route editing ("문학 빼줘", "A홀 근처만").
  const [editText, setEditText] = useState("");
  const [editing, setEditing] = useState(false);

  async function aiEdit() {
    const instruction = editText.trim();
    if (!instruction || editing || orderedIds.length === 0) return;
    setEditing(true);
    try {
      const r = await api.post<{
        keepBoothIds: string[];
        note: string;
        changed: boolean;
      }>("/api/ai/replan", {
        exhibitionSlug: slug,
        boothIds: orderedIds,
        instruction,
      });
      setCartIds(r.keepBoothIds);
      setEditText("");
      toast.success(r.note || "동선을 수정했어요");
    } catch (e) {
      const msg =
        e instanceof ApiClientError ? e.error.message : "수정하지 못했어요";
      toast.error(msg);
    } finally {
      setEditing(false);
    }
  }

  // Re-optimise the order into a nearest-neighbour sweep from the entrance.
  function optimizeOrder() {
    const opt = buildManualRoute(chosen, start, {});
    setCartIds(opt.boothIds);
  }

  // Keep the route store in sync so the navigator can use it.
  useEffect(() => {
    if (ordered.length === 0) {
      setRoute(null);
      return;
    }
    const rp: RoutePlan = {
      id: "local",
      sessionId: "",
      exhibitionId: exhibition.id,
      boothIds: plan.boothIds,
      estimatedMinutes: plan.estimatedMinutes,
      legs: plan.legs,
      scores: {},
      status: "active",
      visitedBoothIds: [],
      isPublic: false,
      createdAt: "",
    };
    setRoute(rp);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan.boothIds.join(",")]);

  if (hydrated && ordered.length === 0) {
    // Distinguish "nothing planned yet" from "viewed everything on the route".
    const allViewed = cartIds.length > 0;
    return (
      <div className="flex min-h-dvh flex-col">
        <AppBar title="내 동선" right={<MyRoutesSheet onLoad={setCartIds} />} />
        <div className="flex flex-1 items-center justify-center p-6">
          <EmptyState
            icon={allViewed ? Check : Navigation}
            title={allViewed ? "동선을 다 둘러봤어요" : "담은 부스가 없어요"}
            description={
              allViewed
                ? "수고했어요! 더 둘러보거나 새 부스를 담아보세요."
                : "지도·목록에서 가고 싶은 부스를 담거나, 맞춤 추천을 받아보세요."
            }
            action={
              <div className="flex flex-col gap-2">
                <Button
                  onClick={() =>
                    location.assign(`/exhibitions/${slug}/onboarding`)
                  }
                >
                  <Sparkles className="size-5" /> 맞춤 추천 받기
                </Button>
                <Button variant="secondary" asChild>
                  <Link href={`/exhibitions/${slug}/map`}>지도에서 담기</Link>
                </Button>
              </div>
            }
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col pb-28 landscape:fixed landscape:inset-0 landscape:z-30 landscape:overflow-hidden landscape:bg-background landscape:pb-0">
      <AppBar
        title="내 동선"
        right={
          <>
            <MyRoutesSheet onLoad={setCartIds} />
            <SaveRouteButton
              exhibitionId={exhibition.id}
              boothIds={orderedIds}
              estimatedMinutes={plan.estimatedMinutes}
              legs={plan.legs}
            />
            <ShareRouteButton
              route={{
                id: "local",
                sessionId: "",
                exhibitionId: exhibition.id,
                boothIds: orderedIds,
                estimatedMinutes: plan.estimatedMinutes,
                legs: plan.legs,
                scores: {},
                status: "active",
                visitedBoothIds: [],
                isPublic: false,
                createdAt: "",
              }}
            />
          </>
        }
      />

      {/* Landscape: map on the left, the route panel on the right (like the map
          page). Portrait: the wrappers are display:contents → normal stacking. */}
      <div className="contents landscape:flex landscape:min-h-0 landscape:flex-1 landscape:flex-row">
        <div
          className={cn(
            "relative border-b border-border transition-[height] landscape:h-full landscape:flex-1 landscape:border-b-0 landscape:border-r",
            viewing ? "h-[58dvh]" : "h-[38dvh]",
          )}
        >
          <ExhibitionMap
            width={exhibition.mapWidth}
            height={exhibition.mapHeight}
            booths={booths}
            categories={categories}
            halls={halls}
            routeOrder={plan.boothIds}
            visitedIds={visitedIds}
            skippedIds={skippedIds}
            floorplan={FLOORPLANS[slug]}
            entrance={start}
            exit={exitPoint}
          />
        </div>

        {/* Right panel (landscape) / continues vertically (portrait). */}
        <div className="contents landscape:flex landscape:w-[440px] landscape:shrink-0 landscape:flex-col landscape:overflow-y-auto landscape:pb-24">
          {!viewing && gates.length > 1 && (
            <div className="mx-4 mt-3 flex items-center gap-2">
              <label className="flex flex-1 items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-sm">
                <LogIn className="size-4 shrink-0 text-success" aria-hidden />
                <span className="shrink-0 text-muted-foreground">입구</span>
                <select
                  value={entranceId}
                  onChange={(e) => setEntranceId(e.target.value)}
                  aria-label="입구 선택"
                  className="min-w-0 flex-1 bg-transparent font-semibold outline-none"
                >
                  {gates.map((g) => (
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
                  {gates.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}

          {!viewing && rationale && (
            <div className="mx-4 mt-3 flex items-start gap-2 rounded-xl border border-border bg-secondary/40 p-3">
              <Sparkles
                className="mt-0.5 size-4 shrink-0 text-primary"
                aria-hidden
              />
              <p className="text-sm leading-snug text-foreground/90">
                {rationale}
              </p>
            </div>
          )}

          <div className="mx-4 mt-3 flex items-center justify-around rounded-xl border border-border bg-card py-2.5 text-sm">
            <span className="flex items-center gap-1.5 font-semibold">
              <MapPin className="size-4 text-muted-foreground" />{" "}
              {ordered.length}곳
            </span>
            <span className="h-6 w-px bg-border" />
            <span className="flex items-center gap-1.5 font-semibold">
              <Clock className="size-4 text-muted-foreground" /> 예상{" "}
              {formatWalk(
                ordered.length * BASE_DWELL_MINUTES + plan.estimatedMinutes,
              )}
            </span>
            <span className="h-6 w-px bg-border" />
            <span className="flex items-center gap-1.5 font-semibold text-muted-foreground">
              <Footprints className="size-4" /> 이동{" "}
              {formatWalk(plan.estimatedMinutes)}
            </span>
          </div>
          <p className="px-5 pb-1 pt-1.5 text-xs text-muted-foreground">
            관람 1곳당 약 {BASE_DWELL_MINUTES}분 기준이에요. ‘이동’은 부스 사이
            걷는 시간이고, 실제 관람 시간은 사람마다 달라요.
          </p>

          {!viewing && (
            <div className="flex items-center justify-between px-5 pb-2 pt-1">
              <span className="text-xs text-muted-foreground">
                <GripVertical className="mr-0.5 inline size-3.5 align-text-bottom" />
                끌어서 순서 변경
              </span>
              {ordered.length > 1 && (
                <button
                  type="button"
                  onClick={optimizeOrder}
                  className="flex items-center gap-1 rounded-full border border-border bg-card px-2.5 py-1 text-xs font-semibold active:bg-accent/40"
                >
                  <ArrowDownNarrowWide className="size-3.5" /> 거리순 정렬
                </button>
              )}
            </div>
          )}

          {!viewing && aiEnabled && (
            <div className="mx-4 mb-2 flex gap-2">
              <div className="relative flex-1">
                <Wand2 className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  placeholder="AI로 수정: 예) 문학 빼줘, A홀 근처만"
                  maxLength={200}
                  disabled={editing}
                  className="h-9 pl-8"
                  aria-label="AI 동선 수정 요청"
                  onKeyDown={(e) => {
                    if (e.nativeEvent.isComposing) return;
                    if (e.key === "Enter") aiEdit();
                  }}
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-9 shrink-0"
                disabled={!editText.trim() || editing}
                onClick={aiEdit}
              >
                {editing ? <Loader2 className="size-4 animate-spin" /> : "수정"}
              </Button>
            </div>
          )}

          <Reorder.Group
            axis="y"
            values={orderedIds}
            onReorder={setCartIds}
            className="space-y-1.5 px-4"
          >
            {ordered.map((b, i) => {
              const isLater = skippedSet.has(b.id);
              return (
                <RouteRow key={b.id} id={b.id}>
                  {/* Minimal stop: order number + booth name only. Details live on
                  the booth page / map — the list stays a clean ordered plan. */}
                  <div
                    className={cn(
                      "flex items-center gap-2.5 rounded-xl border border-border bg-card px-3 py-2.5",
                      isLater && "opacity-60",
                    )}
                  >
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                      {i + 1}
                    </span>
                    <Link
                      href={`/booths/${b.id}`}
                      className="min-w-0 flex-1 truncate text-sm font-semibold"
                    >
                      {b.name}
                      {isLater && (
                        <span className="ml-1.5 text-[11px] font-semibold text-warning">
                          이따
                        </span>
                      )}
                    </Link>
                    <button
                      type="button"
                      aria-label={
                        isLater ? "이따 해제" : "이따 다시 (뒤로 미루기)"
                      }
                      onClick={() => toggleStatus(b.id, "skipped")}
                      className={cn(
                        "flex size-9 shrink-0 items-center justify-center rounded-full active:bg-secondary",
                        isLater ? "text-warning" : "text-muted-foreground",
                      )}
                    >
                      <Clock className="size-4.5" />
                    </button>
                    <button
                      type="button"
                      aria-label="동선에서 빼기"
                      onClick={() => removeFromCart(b.id)}
                      className="flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground active:bg-secondary"
                    >
                      <X className="size-4.5" />
                    </button>
                    <button
                      type="button"
                      aria-label="관람 완료로 표시"
                      onClick={() => toggleStatus(b.id, "visited")}
                      className="flex h-9 shrink-0 items-center gap-1 rounded-full bg-success px-3 text-xs font-bold text-white active:opacity-90"
                    >
                      <Check className="size-4" /> 관람
                    </button>
                  </div>
                </RouteRow>
              );
            })}
          </Reorder.Group>
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 mx-auto flex w-full max-w-md gap-2 border-t border-border bg-background/90 p-4 pb-safe backdrop-blur-xl landscape:inset-x-auto landscape:right-0 landscape:mx-0 landscape:w-[440px] landscape:max-w-none">
        <Button asChild variant="secondary" size="lg">
          <Link href={`/exhibitions/${slug}/map`}>
            <Plus className="size-5" /> 담기
          </Link>
        </Button>
        <Button
          size="lg"
          className="flex-1"
          variant={viewing ? "secondary" : "default"}
          onClick={() => setViewing((v) => !v)}
        >
          <Eye className="size-5" /> {viewing ? "관람 종료" : "관람하기"}
        </Button>
      </div>
    </div>
  );
}

/** One draggable route stop. Drag starts only from the grip handle, so tapping
 * the card still opens the booth and the page can still scroll. */
function RouteRow({ id, children }: { id: string; children: React.ReactNode }) {
  const controls = useDragControls();
  return (
    <Reorder.Item
      value={id}
      dragListener={false}
      dragControls={controls}
      className="flex items-stretch gap-1"
    >
      <button
        type="button"
        aria-label="순서 변경"
        onPointerDown={(e) => controls.start(e)}
        className="flex shrink-0 cursor-grab touch-none items-center self-end px-1 text-muted-foreground active:cursor-grabbing"
      >
        <GripVertical className="size-5" />
      </button>
      <div className="min-w-0 flex-1">{children}</div>
    </Reorder.Item>
  );
}
