"use client";

import { useEffect, useMemo } from "react";
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
} from "lucide-react";
import { formatWalk } from "@/lib/utils";
import { useRouteStore } from "@/lib/stores/route";
import { useCartStore } from "@/lib/stores/cart";
import { useVisitStore, idsByStatus } from "@/lib/stores/visit";
import { useHydrated } from "@/lib/hooks/use-hydrated";
import { buildManualRoute, buildOrderedRoute } from "@/lib/engine/route";
import { FLOORPLANS } from "@/lib/floorplans";
import { AppBar } from "@/components/common/app-bar";
import { BoothCard } from "@/components/booth/booth-card";
import { CartButton } from "@/components/booth/cart-button";
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
  Waiting,
} from "@/lib/types";

export function RouteView({
  slug,
  exhibition,
  booths,
  categories,
  halls,
  waitings,
}: {
  slug: string;
  exhibition: Exhibition;
  booths: Booth[];
  categories: Category[];
  halls: Hall[];
  waitings: Record<string, Waiting>;
}) {
  const hydrated = useHydrated();
  const cartIds = useCartStore((s) => s.ids);
  const setCartIds = useCartStore((s) => s.setIds);
  const setRoute = useRouteStore((s) => s.setRoute);
  const records = useVisitStore((s) => s.records);
  const skippedIds = idsByStatus(records, "skipped");

  const boothById = useMemo(
    () => new Map(booths.map((b) => [b.id, b])),
    [booths],
  );
  const catById = new Map(categories.map((c) => [c.id, c]));
  const start: Point = FLOORPLANS[slug]?.entrance ?? {
    x: Math.round(exhibition.mapWidth / 2),
    y: exhibition.mapHeight,
  };

  // The route follows the visitor's chosen order exactly (cart order). They can
  // drag to rearrange, or tap "거리순 정렬" to re-optimise into a nearest sweep.
  const chosen = useMemo(
    () =>
      (hydrated ? cartIds : [])
        .map((id) => boothById.get(id))
        .filter((b): b is Booth => Boolean(b)),
    [hydrated, cartIds, boothById],
  );
  const plan = useMemo(
    () => buildOrderedRoute(chosen, start),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chosen],
  );

  const ordered = chosen;
  const orderedIds = useMemo(() => ordered.map((b) => b.id), [ordered]);

  // Re-optimise the order into a nearest-neighbour sweep from the entrance.
  function optimizeOrder() {
    const opt = buildManualRoute(chosen, start, {}, waitings);
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
    return (
      <div className="flex min-h-dvh flex-col">
        <AppBar title="내 동선" />
        <div className="flex flex-1 items-center justify-center p-6">
          <EmptyState
            icon={Navigation}
            title="담은 부스가 없어요"
            description="지도·목록에서 가고 싶은 부스를 담거나, 맞춤 추천을 받아보세요."
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
    <div className="flex min-h-dvh flex-col pb-28">
      <AppBar title="내 동선" />

      <div className="relative h-[38dvh] border-b border-border">
        <ExhibitionMap
          width={exhibition.mapWidth}
          height={exhibition.mapHeight}
          booths={booths}
          categories={categories}
          halls={halls}
          routeOrder={plan.boothIds}
          visitedIds={[]}
          skippedIds={skippedIds}
          floorplan={FLOORPLANS[slug]}
        />
      </div>

      <div className="mx-4 mt-3 flex items-center justify-around rounded-xl border border-border bg-card py-2.5 text-sm">
        <span className="flex items-center gap-1.5 font-semibold">
          <MapPin className="size-4 text-primary" /> {ordered.length}곳
        </span>
        <span className="h-6 w-px bg-border" />
        <span className="flex items-center gap-1.5 font-semibold">
          <Footprints className="size-4 text-primary" /> 이동{" "}
          {formatWalk(plan.estimatedMinutes)}
        </span>
        <span className="h-6 w-px bg-border" />
        <span className="flex items-center gap-1.5 font-semibold text-muted-foreground">
          입구→출구
        </span>
      </div>
      <p className="px-5 pb-1 pt-1.5 text-xs text-muted-foreground">
        ‘이동’은 부스 사이 걷는 시간이에요. 부스 관람 시간은 사람마다 달라요.
      </p>

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

      <Reorder.Group
        axis="y"
        values={orderedIds}
        onReorder={setCartIds}
        className="space-y-1.5 px-4"
      >
        {ordered.map((b, i) => (
          <RouteRow key={b.id} id={b.id}>
            {i > 0 && plan.legs[i] && (
              <div className="mb-1 ml-8 flex items-center gap-1 text-xs text-muted-foreground">
                <Footprints className="size-3.5" />{" "}
                {formatWalk(plan.legs[i].minutes)} 이동
              </div>
            )}
            <BoothCard
              booth={b}
              order={i + 1}
              category={catById.get(b.categoryId)}
              waiting={waitings[b.id]}
              compact
              action={<CartButton boothId={b.id} variant="icon" />}
            />
          </RouteRow>
        ))}
      </Reorder.Group>

      <div className="fixed inset-x-0 bottom-0 z-40 mx-auto flex w-full max-w-md gap-2 border-t border-border bg-background/90 p-4 pb-safe backdrop-blur-xl">
        <Button asChild variant="secondary" size="lg">
          <Link href={`/exhibitions/${slug}/map`}>
            <Plus className="size-5" /> 담기
          </Link>
        </Button>
        <Button asChild size="lg" className="flex-1">
          <Link href={`/exhibitions/${slug}/navigate`}>
            <Navigation className="size-5" /> 내비게이션 시작
          </Link>
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
