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
} from "lucide-react";
import { toast } from "sonner";
import { api, ApiClientError } from "@/lib/api/client";
import { formatWalk } from "@/lib/utils";
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
import { MyRoutesSheet } from "@/components/route/my-routes-sheet";
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
  aiEnabled = false,
}: {
  slug: string;
  exhibition: Exhibition;
  booths: Booth[];
  categories: Category[];
  halls: Hall[];
  waitings: Record<string, Waiting>;
  aiEnabled?: boolean;
}) {
  const hydrated = useHydrated();
  const cartIds = useCartStore((s) => s.ids);
  const setCartIds = useCartStore((s) => s.setIds);
  const setRoute = useRouteStore((s) => s.setRoute);
  const interests = useOnboardingStore((s) => s.interests);
  const records = useVisitStore((s) => s.records);
  const skippedIds = idsByStatus(records, "skipped");

  // Why this booth is in the route — derived from the data the page has
  // (onboarding interests + booth signals). Removing a booth = its CartButton.
  function reasonsFor(b: Booth): string[] {
    const out: string[] = [];
    if (b.tags.some((t) => interests.includes(t))) out.push("관심 분야");
    if (b.popularity >= 70) out.push("인기 부스");
    const w = waitings[b.id];
    if (w?.enabled && w.estimatedMinutes < 10) out.push("대기 짧음");
    return out;
  }

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

  // AI one-line reasons per booth (lazy; augments the instant data chips).
  const [aiReasons, setAiReasons] = useState<Record<string, string>>({});
  const orderedKey = orderedIds.join(",");
  useEffect(() => {
    if (!aiEnabled || !hydrated || orderedIds.length === 0) return;
    let cancelled = false;
    api
      .post<{ reasons: Record<string, string> }>("/api/ai/route-reasons", {
        exhibitionSlug: slug,
        boothIds: orderedIds,
        interests,
      })
      .then((r) => {
        if (!cancelled) setAiReasons(r.reasons ?? {});
      })
      .catch(() => {
        /* AI off / failed — instant data chips still cover the why. */
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderedKey, hydrated]);

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
        <AppBar title="내 동선" right={<MyRoutesSheet onLoad={setCartIds} />} />
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
          </>
        }
      />

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

      {aiEnabled && (
        <div className="mx-4 mb-2 flex gap-2">
          <div className="relative flex-1">
            <Wand2 className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-primary" />
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
            {reasonsFor(b).length > 0 && (
              <div className="ml-8 mt-1 flex flex-wrap gap-1">
                {reasonsFor(b).map((r) => (
                  <span
                    key={r}
                    className="inline-flex items-center gap-0.5 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary"
                  >
                    <Sparkles className="size-3" aria-hidden /> {r}
                  </span>
                ))}
              </div>
            )}
            {aiReasons[b.id] && (
              <p className="ml-8 mt-1 text-xs leading-snug text-muted-foreground">
                <Sparkles
                  className="mr-0.5 inline size-3 text-primary"
                  aria-hidden
                />
                {aiReasons[b.id]}
              </p>
            )}
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
