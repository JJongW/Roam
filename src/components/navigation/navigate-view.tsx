"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Loader2,
  MapPin,
  Navigation as NavIcon,
  RotateCcw,
  Flag,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api/client";
import { nextInstruction, bearing } from "@/lib/engine/navigation";
import { useRouteStore } from "@/lib/stores/route";
import { useCartStore } from "@/lib/stores/cart";
import { useVisitStore, pushNote } from "@/lib/stores/visit";
import { buildOrderedRoute } from "@/lib/engine/route";
import { AppBar } from "@/components/common/app-bar";
import { ExhibitionMap } from "@/components/map/exhibition-map";
import { FLOORPLANS } from "@/lib/floorplans";
import { NavInstructionBanner as NavBanner } from "@/components/navigation/nav-instruction";
import { EmptyState, LoadingScreen } from "@/components/common/states";
import { useHydrated } from "@/lib/hooks/use-hydrated";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type {
  Booth,
  Category,
  Exhibition,
  Hall,
  Point,
  RoutePlan,
} from "@/lib/types";

export function NavigateView({
  slug,
  exhibition,
  booths,
  categories,
  halls,
}: {
  slug: string;
  exhibition: Exhibition;
  booths: Booth[];
  categories: Category[];
  halls: Hall[];
}) {
  const router = useRouter();
  const hydrated = useHydrated();
  const route = useRouteStore((s) => s.route);
  const setRoute = useRouteStore((s) => s.setRoute);
  const markVisited = useRouteStore((s) => s.markVisited);
  const setCurrent = useRouteStore((s) => s.setCurrent);

  const cartIds = useCartStore((s) => s.ids);

  // Drop a route left over from a different exhibition before we read it.
  useEffect(() => {
    if (route && route.exhibitionId !== exhibition.id)
      useRouteStore.getState().clear();
  }, [route, exhibition.id]);

  const boothById = useMemo(
    () => new Map(booths.map((b) => [b.id, b])),
    [booths],
  );

  // Build the route from the visitor's cart when none is in the store yet
  // (e.g. opening this page directly, or after a reload). Keeps an existing
  // in-progress route so visited markers aren't lost.
  useEffect(() => {
    if (route && route.exhibitionId === exhibition.id) return;
    const chosen = cartIds
      .map((id) => boothById.get(id))
      .filter((b): b is Booth => Boolean(b));
    if (chosen.length === 0) return;
    const start = FLOORPLANS[slug]?.entrance ?? {
      x: Math.round(exhibition.mapWidth / 2),
      y: exhibition.mapHeight,
    };
    const plan = buildOrderedRoute(chosen, start);
    setRoute({
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
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route, cartIds.join(","), boothById, slug]);

  const entrance: Point = useMemo(
    () => ({
      x: Math.round(exhibition.mapWidth / 2),
      y: exhibition.mapHeight - 24,
    }),
    [exhibition],
  );

  // Indoor venue → no GPS. The visitor's current location is whichever booth
  // they tell us they're at (or the entrance). null = 입구.
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [heading, setHeading] = useState<number | undefined>(undefined);
  const [recalculating, setRecalculating] = useState(false);

  const position: Point = useMemo(() => {
    const b = currentId ? boothById.get(currentId) : undefined;
    return b ? { x: b.x, y: b.y } : entrance;
  }, [currentId, boothById, entrance]);

  const visited = route?.visitedBoothIds ?? [];
  const orderedRemaining = (route?.boothIds ?? []).filter(
    (id) => !visited.includes(id),
  );
  const nextBooth = orderedRemaining[0]
    ? boothById.get(orderedRemaining[0])
    : undefined;
  const allDone = Boolean(route) && orderedRemaining.length === 0;
  const currentBooth = currentId ? boothById.get(currentId) : undefined;

  // Set current location to a booth (or 입구), updating heading toward it.
  function setLocation(id: string | null) {
    const target = id ? boothById.get(id) : undefined;
    const p: Point = target ? { x: target.x, y: target.y } : entrance;
    setHeading(bearing(position, p));
    setCurrentId(id);
  }

  const arrive = useCallback(
    (booth: Booth) => {
      markVisited(booth.id);
      // Mirror into personal records so the map / detail reflect the visit.
      useVisitStore.getState().setStatus(booth.id, "visited");
      void pushNote(booth.id);
      const after = (route?.boothIds ?? []).filter(
        (id) => ![...visited, booth.id].includes(id),
      );
      if (after[0]) setCurrent(after[0]);
      // The booth you just reached becomes your current location.
      setCurrentId(booth.id);
      api
        .post("/api/analytics/events", {
          type: "booth_arrive",
          boothId: booth.id,
          x: booth.x,
          y: booth.y,
        })
        .catch(() => {});
      toast.success(`${booth.name} 도착!`);
    },
    [markVisited, route, visited, setCurrent],
  );

  // Re-order the remaining booths as a nearest-first sweep from the current
  // location (replaces GPS "off-route" detection — visitor-driven).
  async function reorder() {
    if (!route) return;
    setRecalculating(true);
    try {
      const { route: updated } = await api.patch<{ route: RoutePlan }>(
        `/api/route/${route.id}`,
        { deviated: true, position, visitedBoothIds: visited },
      );
      setRoute({ ...updated, visitedBoothIds: visited });
      toast.success("현재 위치 기준으로 남은 동선을 다시 정렬했어요");
    } catch {
      toast.error("재정렬에 실패했어요");
    } finally {
      setRecalculating(false);
    }
  }

  async function finish() {
    if (!route) return;
    try {
      await api.patch(`/api/route/${route.id}`, { status: "completed" });
    } catch {
      /* non-blocking */
    }
    toast.success("관람을 완료했어요! 🎉");
    router.push(`/exhibitions/${slug}/route`);
  }

  // Wait for persisted stores (route in sessionStorage, cart in localStorage)
  // to hydrate before judging the route empty — otherwise a deep-link/reload
  // flashes the empty state before the cart-rebuild effect above can run.
  if (!hydrated) {
    return (
      <div className="flex min-h-dvh flex-col">
        <AppBar title="내비게이션" />
        <div className="flex flex-1 items-center justify-center p-6">
          <LoadingScreen label="경로 준비 중" />
        </div>
      </div>
    );
  }

  if (!route || route.boothIds.length === 0) {
    return (
      <div className="flex min-h-dvh flex-col">
        <AppBar title="내비게이션" />
        <div className="flex flex-1 items-center justify-center p-6">
          <EmptyState
            icon={NavIcon}
            title="안내할 경로가 없어요"
            description="먼저 맞춤 동선을 생성해 주세요."
            action={
              <Button
                onClick={() => router.push(`/exhibitions/${slug}/onboarding`)}
              >
                맞춤 추천 받기
              </Button>
            }
          />
        </div>
      </div>
    );
  }

  const instruction = nextBooth
    ? nextInstruction(position, nextBooth, 60, heading)
    : {
        direction: "arrive" as const,
        text: "모든 부스 방문 완료",
        meters: 0,
        bearing: 0,
      };
  const progress = (visited.length / route.boothIds.length) * 100;

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <AppBar title="내비게이션" />

      {!allDone ? (
        <NavBanner
          instruction={instruction}
          stepLabel={`${visited.length + 1} / ${route.boothIds.length}번째 목적지`}
        />
      ) : (
        <div className="flex items-center gap-3 px-5 py-4">
          <CheckCircle2 className="size-10 text-success" />
          <div>
            <p className="text-xl font-extrabold">관람 완료!</p>
            <p className="text-sm text-muted-foreground">
              {route.boothIds.length}개 부스를 모두 둘러봤어요.
            </p>
          </div>
        </div>
      )}

      <Progress value={progress} className="mx-5" />

      {/* Current-location picker (no GPS). Pick the booth you're standing at. */}
      {!allDone && (
        <div className="mx-5 mt-3 flex items-center gap-2 rounded-xl border border-border bg-card p-2 pl-3">
          <MapPin className="size-4 shrink-0 text-primary" aria-hidden />
          <label htmlFor="current-loc" className="shrink-0 text-sm font-semibold">
            현재 위치
          </label>
          <select
            id="current-loc"
            value={currentId ?? ""}
            onChange={(e) => setLocation(e.target.value || null)}
            className="min-w-0 flex-1 truncate rounded-md border border-input bg-background px-2 py-1.5 text-sm"
            aria-label="현재 위치 부스 선택"
          >
            <option value="">입구에서 시작</option>
            {booths.map((b) => (
              <option key={b.id} value={b.id}>
                {b.code ? `${b.code} · ` : ""}
                {b.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="relative mt-3 flex-1">
        <ExhibitionMap
          width={exhibition.mapWidth}
          height={exhibition.mapHeight}
          booths={booths}
          categories={categories}
          halls={halls}
          floorplan={FLOORPLANS[slug]}
          routeOrder={route.boothIds}
          visitedIds={visited}
          position={position}
          selectedId={nextBooth?.id}
          fillHeight
          focus={position}
        />
        <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-1 rounded-full bg-card/90 px-3 py-1.5 text-xs font-medium shadow-[var(--shadow-card)] backdrop-blur">
          <MapPin className="size-3.5" />
          {currentBooth ? `현재: ${currentBooth.name}` : "현재: 입구"}
        </div>
      </div>

      <div className="flex gap-2 border-t border-border bg-background p-4 pb-safe">
        {allDone ? (
          <Button size="lg" className="flex-1" onClick={finish}>
            <Flag className="size-5" /> 관람 완료
          </Button>
        ) : (
          <>
            <Button
              size="lg"
              variant="outline"
              onClick={reorder}
              disabled={recalculating}
              aria-label="현재 위치 기준 재정렬"
            >
              {recalculating ? (
                <Loader2 className="size-5 animate-spin" />
              ) : (
                <RotateCcw className="size-5" />
              )}
              재정렬
            </Button>
            <Button
              size="lg"
              className="flex-1"
              onClick={() => nextBooth && arrive(nextBooth)}
            >
              <CheckCircle2 className="size-5" />
              {nextBooth ? `${nextBooth.name} 도착 체크` : "도착 체크"}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
