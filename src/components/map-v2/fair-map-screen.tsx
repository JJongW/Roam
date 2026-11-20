"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bath,
  Coffee,
  DoorOpen,
  Info,
  Minus,
  Plus,
  Package,
  Search,
  Utensils,
  X,
} from "lucide-react";
import { clsx } from "clsx";
import { ExhibitionMap, type MapHandle } from "@/components/map/exhibition-map";
import { MapLayerV2, type RouteOverlay } from "@/components/map-v2/map-layer";
import { RomiSheet } from "@/components/map-v2/romi-sheet";
import { RouteSheet } from "@/components/map-v2/route-sheet";
import { RecapSheet } from "@/components/map-v2/recap-sheet";
import { RomiCard, type RomiCardAction } from "@/components/map-v2/romi-card";
import {
  heartedOnTheWay,
  nextStop,
  routePath,
  type RouteBooth,
} from "@/lib/route/guide";
import type { RoutePt } from "@/lib/aisle-route";
import { exhibitionStatus } from "@/lib/exhibition/status";
import { todayISO } from "@/lib/exhibition/current";
import { useAuthStore } from "@/lib/stores/auth";
import { BoothCardV2 } from "@/components/map-v2/booth-card";
import { HallSwitch } from "@/components/map-v2/hall-switch";
import { RomiAvatar } from "@/components/v2/romi-avatar";
import { BackButton } from "@/components/v2/back-button";
import { FLOORPLANS } from "@/lib/floorplans";
import { floorplanHallOf } from "@/lib/floorplan/hall-of";
import {
  isHearted,
  isVisited,
  useVisitStore,
  type BoothRecord,
} from "@/lib/stores/visit";
import { RomiLineCard } from "@/components/map-v2/romi-line-card";
import { TodaySheet, isToday } from "@/components/map-v2/today-sheet";
import { restoreRecord } from "@/components/booth-v2/booth-actions";
import { Snackbar, type SnackbarState } from "@/components/v2/snackbar";
import { useHydrated } from "@/lib/hooks/use-hydrated";
import { AMENITIES, label, romi, system, type AmenityId } from "@/lib/copy/v1";
import { SCREEN, track } from "@/lib/analytics/app-track";
import { trackUiClick } from "@/lib/analytics/ui-controls";
import { V2_PX } from "@/styles/v2/lengths.generated";
import type { BoothListItem, ExhibitionDetail } from "@/lib/types";

const AMENITY_ICON: Record<AmenityId, typeof Bath> = {
  toilet: Bath,
  restaurant: Utensils,
  cafe: Coffee,
  entrance: DoorOpen,
  storage: Package,
  info: Info,
};

/**
 * UI 3-01 박람회 지도(Figma 2994:1007), 3-02 부스 고른 지도, 3-04~3-06 찾기.
 *
 * 박람회를 고르면 바로 이 화면이다(지도 먼저, 브랜드 규칙 §4). 위에서 아래로:
 * 찾기 줄 → 편의시설 칩 → (오른쪽) 홀 버튼 → 지도 → 아래 로미 줄 또는 부스 카드.
 * 웹에서 다른 점:
 * - 찾기 줄 왼쪽에 뒤로 버튼(iOS는 탭바로 돌아가지만 웹은 박람회 홈으로 돌아갈 길이 필요하다).
 * - 넓은 화면(md 이상)은 손가락 확대가 없어 확대, 축소 버튼을 오른쪽 아래에 둔다.
 *   카드는 왼쪽 아래 고정 폭으로 띄워 지도를 덜 가린다.
 * - 동선 추천, 관심 밀도는 없다. 길 안내(UI 9)는 원할 때만: 부스 카드 "길 안내"나 로미 시트 칩에서 시작한다.
 * - 아래 로미 알약을 누르면 로미 시트(UI 7)가 올라온다. 맨 아래 "오늘은 여기까지 할게요"가 회고(UI 12) 입구다.
 */

/** UI 9 길 안내 한 번. 메모리에만 있다(추적 없음, iOS RouteSession과 같은 단계). */
interface RouteSession {
  step: "pickTarget" | "askStart" | "drawn" | "direct" | "waiting" | "next";
  targetId?: string;
  /** 들렀다 가는 중이면 원래 가려던 곳. */
  finalId?: string;
  /** 출발 부스. 없고 drawn이면 출입구에서. */
  startId?: string;
  path: RoutePt[];
  onTheWayId?: string;
  nextId?: string;
  source: string;
  attempt: number;
}
export function FairMapScreen({
  detail,
  booths,
  initialFocusId,
}: {
  detail: ExhibitionDetail;
  booths: BoothListItem[];
  initialFocusId?: string;
}) {
  const slug = detail.exhibition.slug;
  const floorplan = FLOORPLANS[slug];
  const mapRef = useRef<MapHandle>(null);
  const hydrated = useHydrated();
  const records = useVisitStore((s) => s.records);
  const [selectedId, setSelectedId] = useState<string | null>(
    initialFocusId ?? null,
  );
  const [query, setQuery] = useState("");
  const [amenity, setAmenity] = useState<AmenityId | null>(null);
  const [hall, setHall] = useState<string | null>(null);
  // 지도 위에 떠 있는 위(찾기 줄, 칩, 홀 버튼)와 아래(로미 줄, 카드)가 가리는 높이.
  // 지도는 그 사이 띠에 맞춰 들어온다(iOS 안전 영역과 같은 뜻). 지도 그림 자체는 화면 전체에 그린다.
  const rootRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [insets, setInsets] = useState({ top: 0, bottom: 0 });
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const gap = V2_PX["spacing-x2"];
    const measure = () => {
      const r = root.getBoundingClientRect();
      const t = topRef.current?.getBoundingClientRect();
      const b = bottomRef.current?.getBoundingClientRect();
      const next = {
        top: t ? Math.round(t.bottom - r.top + gap) : 0,
        bottom: b && b.height > 0 ? Math.round(r.bottom - b.top + gap) : 0,
      };
      setInsets((p) =>
        p.top === next.top && p.bottom === next.bottom ? p : next,
      );
    };
    measure();
    const ro = new ResizeObserver(measure);
    for (const el of [root, topRef.current, bottomRef.current])
      if (el) ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const hallNameById = useMemo(
    () => new Map(detail.halls.map((h) => [h.id, h.name])),
    [detail.halls],
  );
  // 부스의 홀 이름: 배치도가 있으면 부스 칸이 들어 있는 배치도 홀 이름(지도와 같은 말),
  // 없으면 부스 데이터의 홀 이름.
  const hallOf = (b: BoothListItem): string | undefined =>
    floorplanHallOf(floorplan, b.code) ?? hallNameById.get(b.hallId);
  const catById = useMemo(
    () => new Map(detail.categories.map((c) => [c.id, c])),
    [detail.categories],
  );
  const hallNames = useMemo(
    () =>
      floorplan
        ? floorplan.halls.map((h) => h.name)
        : detail.halls.map((h) => h.name),
    [floorplan, detail.halls],
  );

  const heartIds = useMemo(() => {
    if (!hydrated) return new Set<string>();
    return new Set(
      Object.entries(records)
        .filter(([, r]) => isHearted(r))
        .map(([id]) => id),
    );
  }, [records, hydrated]);

  // 6-03 로미 줄: 카드 알약으로 다녀왔어요를 켠 직후. 되돌리기는 켜기 전 기록(평가까지)으로 돌린다.
  const [remembered, setRemembered] = useState<{
    boothId: string;
    name: string;
    before: BoothRecord | undefined;
  } | null>(null);
  const clearRemembered = useCallback(() => setRemembered(null), []);
  // 6-04 오늘 다녀온 곳: 이 박람회에서 오늘 다녀온 부스가 있을 때만 입구를 보인다.
  const [todayOpen, setTodayOpen] = useState(false);
  // UI 7 로미 시트, 12 회고, 9 길 안내, 7-05 장소 답(지금 어디, 편의시설)
  const [sheet, setSheet] = useState<"romi" | "recap" | null>(null);
  const [route, setRoute] = useState<RouteSession | null>(null);
  const [arrivedId, setArrivedId] = useState<string | null>(null);
  const [answer, setAnswer] = useState<{
    title: string;
    boothId?: string;
  } | null>(null);
  const signedIn = useAuthStore((s) => !!s.user);
  const isOpenDay = useMemo(
    () => exhibitionStatus(detail.exhibition, todayISO()) === "ongoing",
    [detail.exhibition],
  );
  const canRoute = isOpenDay && !!floorplan;
  const [snack, setSnack] = useState<SnackbarState | null>(null);
  const closeSnack = useCallback(() => setSnack(null), []);
  const todayBooths = useMemo(() => {
    if (!hydrated) return [];
    return booths
      .filter(
        (b) => isVisited(records[b.id]) && isToday(records[b.id]?.visitedAt),
      )
      .sort((a, b) =>
        (records[b.id]?.visitedAt ?? "").localeCompare(
          records[a.id]?.visitedAt ?? "",
        ),
      );
  }, [booths, records, hydrated]);

  const visitedIds = useMemo(() => {
    if (!hydrated) return new Set<string>();
    return new Set(
      Object.entries(records)
        .filter(([, r]) => isVisited(r))
        .map(([id]) => id),
    );
  }, [records, hydrated]);

  // 편의시설 칩은 이 박람회 데이터에 실제로 있는 종류만 띄운다(없는 칩을 그리지 않는다).
  // 두 군데서 모은다: 편의시설 부스 칸(이름으로 가름)과 배치도 표식(화장실, 출입구). 표식은 장소
  // 데이터(venues/*.json)에서 오고 iOS도 이걸로 칩을 띄운다(W3 검토: sif에서 웹만 칩이 없었다).
  const amenityMatches = useMemo(() => {
    const out = new Map<AmenityId, string[]>();
    for (const a of AMENITIES) {
      const ids = booths
        .filter((b) => b.kind === "facility" && a.match.test(b.name))
        .map((b) => b.id);
      if (ids.length) out.set(a.id, ids);
    }
    return out;
  }, [booths]);
  const amenityPoints = useMemo(() => {
    const out = new Map<AmenityId, { x: number; y: number }[]>();
    if (!floorplan) return out;
    const wc = floorplan.decor.filter((d) => d.type === "wc");
    if (wc.length) out.set("toilet", wc);
    const ents = floorplan.decor.filter((d) => d.type === "entrance");
    const gates = ents.length ? ents : (floorplan.gates ?? []);
    if (gates.length) out.set("entrance", gates);
    return out;
  }, [floorplan]);
  const amenityIds = useMemo(
    () =>
      AMENITIES.filter(
        (a) => amenityMatches.has(a.id) || amenityPoints.has(a.id),
      ),
    [amenityMatches, amenityPoints],
  );

  const q = query.trim().toLowerCase();
  const results = useMemo(() => {
    if (!q) return [];
    return booths.filter(
      (b) =>
        b.kind !== "facility" &&
        [b.name, b.company, b.code, ...(b.aliases ?? [])].some((t) =>
          t?.toLowerCase().includes(q),
        ),
    );
  }, [booths, q]);

  const highlightIds = useMemo(() => {
    if (amenity) return new Set(amenityMatches.get(amenity) ?? []);
    return null;
  }, [amenity, amenityMatches]);

  const selected = selectedId
    ? booths.find((b) => b.id === selectedId)
    : undefined;
  const showCard = selected && selected.kind !== "facility";

  // 한 번만: 화면 보기, 지도 불러오기 결과(서버에서 받아 그렸으니 ok, 캐시 아님).
  useEffect(() => {
    track("screen_view", { screen: SCREEN.map, exhibitionSlug: slug });
    track("map_load_result", {
      screen: SCREEN.map,
      exhibitionSlug: slug,
      props: {
        ok: true,
        ms: Math.round(performance.now()),
        from_cache: false,
        booth_count: booths.length,
        hall_count: hallNames.length,
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  const select = (id: string, from: "map" | "search") => {
    setSelectedId(id || null);
    if (id) {
      const b = booths.find((x) => x.id === id);
      if (b && b.kind !== "facility")
        track("booth_card_open", {
          screen: SCREEN.map,
          exhibitionSlug: slug,
          boothId: id,
          props: { from },
        });
    }
  };

  // 편의시설 표식은 홀 끝과 끝에 흩어져 있다. 다 담으려 줄이면 지도가 점이 되니, 지금 보는 곳에서
  // 가장 가까운 한 곳을 비춘다("가장 가까운 화장실").
  const nearestFirst = (pts: { x: number; y: number }[]) => {
    const c = mapRef.current?.viewCenter();
    if (!c || pts.length < 2) return pts;
    const d = (p: { x: number; y: number }) =>
      (p.x - c.x) ** 2 + (p.y - c.y) ** 2;
    return [pts.reduce((a, b) => (d(b) < d(a) ? b : a))];
  };

  const focusIds = (
    ids: string[],
    context = 0.3,
    points: { x: number; y: number }[] = [],
    opts?: { atFit?: boolean },
  ) => {
    type Box = { x: number; y: number; w: number; h: number };
    const rects: Box[] = [
      ...ids
        .map((id) => booths.find((b) => b.id === id))
        .map((b): Box | undefined =>
          b?.code
            ? floorplan?.booths.find((fb) => fb.code === b.code)
            : undefined,
        )
        .filter((r): r is Box => !!r),
      ...points.map((p) => ({ x: p.x, y: p.y, w: 0, h: 0 })),
    ];
    if (!rects.length) return;
    const x0 = Math.min(...rects.map((r) => r.x - r.w / 2));
    const y0 = Math.min(...rects.map((r) => r.y - r.h / 2));
    const x1 = Math.max(...rects.map((r) => r.x + r.w / 2));
    const y1 = Math.max(...rects.map((r) => r.y + r.h / 2));
    const pad = Math.max(x1 - x0, y1 - y0) * context + 60;
    mapRef.current?.focusRect(
      {
        x: x0 - pad,
        y: y0 - pad,
        w: x1 - x0 + pad * 2,
        h: y1 - y0 + pad * 2,
      },
      opts,
    );
  };

  // 부스 하나를 보여 줄 때(찾기, 지도에서 보기): 그 부스가 있는 홀 하나를 안전 띠에 맞춘다
  // (UI 3-02, iOS와 같음). 홀이 하나뿐인 도면이면 지도 전체가 그 홀이다. 홀을 모르면 이웃과 함께.
  const lastFocus = useRef<string | null>(null);
  const focusBooth = (id: string) => {
    lastFocus.current = id;
    const b = booths.find((x) => x.id === id);
    const name = b ? floorplanHallOf(floorplan, b.code) : undefined;
    const r = name ? floorplan?.halls.find((h) => h.name === name) : undefined;
    if (r) mapRef.current?.focusRect(r);
    else focusIds([id], 2.5);
  };

  // 부스를 맞춘 뒤 카드가 떠서 아래 띠가 높아지면 같은 부스를 새 띠에 다시 맞춘다.
  useEffect(() => {
    if (lastFocus.current && selectedId === lastFocus.current)
      focusBooth(lastFocus.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [insets.top, insets.bottom]);

  // "지도에서 보기"(4-02)로 들어오면 그 부스를 이웃과 함께 읽히는 배율로 맞춘다.
  useEffect(() => {
    if (!initialFocusId) return;
    // 엔진이 저장된 보기를 되살리고 크기를 잰 뒤에 맞춘다(그 전에 맞추면 되살린 보기가 덮는다).
    const t = setTimeout(() => focusBooth(initialFocusId), 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialFocusId]);

  const pickHall = (h: string | null) => {
    setHall(h);
    track("hall_switch", {
      screen: SCREEN.map,
      exhibitionSlug: slug,
      props: { to_all: h === null },
    });
    if (h === null) return mapRef.current?.reset();
    const r = floorplan?.halls.find((x) => x.name === h);
    if (r) mapRef.current?.focusRect(r);
  };

  // ---- UI 9 길 안내(iOS FairMapViewModel+Phase3를 옮김) ----
  const boothById = useMemo(
    () => new Map(booths.map((b) => [b.id, b])),
    [booths],
  );
  const rb = (b: BoothListItem): RouteBooth => ({
    id: b.id,
    code: b.code,
    name: b.name,
  });
  const heartedBooths = useMemo(
    () =>
      booths.filter((b) => b.kind !== "facility" && heartIds.has(b.id)),
    [booths, heartIds],
  );
  const nameOf = (id?: string) => (id ? (boothById.get(id)?.name ?? "") : "");
  const routeCtx = (screen: (typeof SCREEN)[keyof typeof SCREEN]) => ({
    screen,
    exhibitionSlug: slug,
  });

  const startRoute = (boothId: string | null, source: string) => {
    track("route_start", {
      ...routeCtx(SCREEN.map),
      boothId: boothId ?? undefined,
      props: { from: source },
    });
    setSheet(null);
    setAnswer(null);
    setRemembered(null);
    setArrivedId(null);
    setSelectedId(null);
    setRoute({
      step: boothId ? "askStart" : "pickTarget",
      targetId: boothId ?? undefined,
      path: [],
      source,
      attempt: 0,
    });
  };

  /** 9-02 답으로 선을 한 번 그린다. null은 "잘 모르겠어요"(출입구에서). */
  const drawRoute = (r: RouteSession, startId: string | null) => {
    const target = boothById.get(r.targetId ?? "");
    if (!target || !floorplan) return;
    const from = startId ? boothById.get(startId) : undefined;
    const attempt = r.attempt + 1;
    track("nearby_answer", {
      ...routeCtx(SCREEN.routeNearby),
      boothId: startId ?? undefined,
      props: { result: startId ? "found" : "dont_know", attempt },
    });
    const path = routePath(floorplan, from?.code, target.code) ?? [];
    const exclude = new Set(
      [startId, r.targetId, r.finalId].filter((x): x is string => !!x),
    );
    const stop = heartedOnTheWay(
      floorplan,
      path,
      heartedBooths.map(rb),
      exclude,
    );
    setRoute({
      ...r,
      step: "drawn",
      startId: startId ?? undefined,
      path,
      onTheWayId: stop?.id,
      attempt,
    });
    setSelectedId(null);
    track("route_line_drawn", {
      ...routeCtx(SCREEN.routeDrawn),
      boothId: target.id,
      props: { ok: path.length > 0, count: path.length },
    });
    lastFocus.current = null;
    focusIds([target.id, ...(startId ? [startId] : [])], 0.3, path);
  };

  const routeStopBy = () => {
    if (!route?.onTheWayId || !floorplan) return;
    const stop = boothById.get(route.onTheWayId);
    if (!stop) return;
    const from = route.startId ? boothById.get(route.startId) : undefined;
    const path = routePath(floorplan, from?.code, stop.code) ?? [];
    track("route_just_go", {
      ...routeCtx(SCREEN.routeDrawn),
      boothId: stop.id,
      props: { choice: "stop_by" },
    });
    setRoute({
      ...route,
      finalId: route.targetId,
      targetId: stop.id,
      path,
      onTheWayId: undefined,
      step: "waiting",
    });
    focusIds([stop.id, ...(from ? [from.id] : [])], 0.3, path);
  };

  const routeJustGo = () => {
    if (!route) return;
    track("route_just_go", {
      ...routeCtx(SCREEN.routeDrawn),
      boothId: route.targetId,
      props: { choice: "just_go" },
    });
    setRoute({ ...route, onTheWayId: undefined, step: "direct" });
  };

  /** 9-06 도착. 다녀왔어요는 켜지 않는다(도착과 방문 기록은 다른 신호, 브랜드 규칙 §4). */
  const routeArrived = () => {
    if (!route?.targetId || !floorplan) return;
    const target = boothById.get(route.targetId);
    if (!target) return;
    track("booth_arrive", {
      ...routeCtx(SCREEN.routeArrived),
      boothId: target.id,
      props: { from: route.source },
    });
    setArrivedId(target.id);
    setSelectedId(target.id);
    const pool = heartedBooths.filter((b) => !visitedIds.has(b.id)).map(rb);
    const next = route.finalId ?? nextStop(floorplan, rb(target), pool)?.id;
    setRoute(
      next
        ? {
            ...route,
            step: "next",
            startId: target.id,
            nextId: next,
            finalId: undefined,
            path: [],
            onTheWayId: undefined,
          }
        : null,
    );
  };

  const routeGoNext = () => {
    if (!route?.nextId) return;
    setArrivedId(null);
    drawRoute(
      {
        step: "askStart",
        targetId: route.nextId,
        startId: route.startId,
        path: [],
        source: "next",
        attempt: 0,
      },
      route.startId ?? null,
    );
  };

  const endRoute = () => {
    if (route)
      track("map_control", {
        ...routeCtx(SCREEN.routeDrawn),
        props: { control: "route_end" },
      });
    setRoute(null);
  };

  const routeOverlay: RouteOverlay | null = (() => {
    if (route && ["drawn", "direct", "waiting"].includes(route.step)) {
      const s = route.startId ? boothById.get(route.startId) : undefined;
      return {
        path: route.path,
        targetId: route.targetId,
        // 출입구에서 그리면 출입구 표식이 이미 있어 이름표를 겹쳐 달지 않는다.
        startLabel: route.path.length && s ? label.startFront(s.name) : undefined,
      };
    }
    if (answer?.boothId) return { path: [], targetId: answer.boothId };
    return null;
  })();

  const routeCard = (() => {
    if (!route) return null;
    const target = nameOf(route.targetId);
    const end: RomiCardAction = { label: label.endGuide, onClick: endRoute };
    const other: RomiCardAction = {
      label: label.otherBoothFront,
      onClick: () => setRoute({ ...route, step: "askStart" }),
    };
    const arrived: RomiCardAction = {
      label: label.arrived,
      primary: true,
      onClick: routeArrived,
    };
    switch (route.step) {
      case "drawn": {
        const title = !route.path.length
          ? romi.routeOnlyPlace(target)
          : route.startId
            ? romi.routeDrawn(target)
            : romi.routeFromEntrance(target);
        if (route.onTheWayId)
          return (
            <RomiCard
              title={title}
              sub={romi.routeOnTheWay(nameOf(route.onTheWayId))}
              actions={[
                { label: label.stopBy, primary: true, onClick: routeStopBy },
                { label: label.justGo, onClick: routeJustGo },
              ]}
              trailing={end}
            />
          );
        return (
          <RomiCard
            title={title}
            sub={romi.routeArriveAsk}
            actions={[arrived, other]}
            trailing={end}
          />
        );
      }
      case "direct":
        return (
          <RomiCard
            title={romi.routeDirect(target)}
            sub={romi.routeReaskHint}
            actions={[arrived, other]}
            trailing={end}
          />
        );
      case "waiting":
        return (
          <RomiCard
            title={romi.routeDrawn(target)}
            sub={romi.routeArriveAsk}
            actions={[arrived, other]}
            trailing={end}
          />
        );
      case "next":
        return (
          <RomiCard
            title={romi.routeNextAsk(nameOf(route.nextId))}
            sub={romi.routeNextSkip}
            actions={[
              { label: label.goTogether, primary: true, onClick: routeGoNext },
              { label: label.noThanks, onClick: endRoute },
            ]}
          />
        );
      default:
        return null;
    }
  })();

  // 편의시설 칩과 로미 시트 칩이 같은 동작을 한다(가장 가까운 한 곳을 비춘다).
  const pickAmenity = (next: AmenityId | null) => {
    setAmenity(next);
    if (next)
      focusIds(
        amenityMatches.get(next) ?? [],
        0.3,
        nearestFirst(amenityPoints.get(next) ?? []),
        { atFit: true },
      );
  };

  const fairStats = useMemo(() => {
    const here = booths.filter((b) => b.kind !== "facility");
    return {
      visited: here.filter((b) => visitedIds.has(b.id)).length,
      good: here.filter(
        (b) => visitedIds.has(b.id) && records[b.id]?.verdict === "good",
      ).length,
      memos: here.filter((b) => !!records[b.id]?.memo?.trim()).length,
    };
  }, [booths, visitedIds, records]);

  const romiLine = hall
    ? romi.inHall(hall)
    : hallNames.length === 1
      ? romi.inHall(hallNames[0])
      : romi.lookAround;

  return (
    // fixed: 방문객 레이아웃의 폰 폭 기둥(max-w-md)을 벗어나 넓은 화면에서도 지도가 화면을 다 쓴다.
    // 찾기 줄, 칩, 카드는 본문 최대 폭(content-max-width)으로 왼쪽에 띄운다.
    <div
      ref={rootRef}
      className="fixed inset-0 z-0 overflow-hidden bg-v2-bg-layer-basement font-v2-ui"
    >
      <ExhibitionMap
        handleRef={mapRef}
        hideControls
        className="bg-v2-bg-layer-basement"
        width={detail.exhibition.mapWidth}
        height={detail.exhibition.mapHeight}
        booths={booths}
        categories={detail.categories}
        halls={detail.halls}
        floorplan={floorplan}
        entry="whole"
        persistKey={slug}
        exhibitionSlug={slug}
        viewportClassName="inset-0"
        selectedId={selectedId}
        safeInsets={insets}
        onSelect={(id) => select(id, "map")}
        renderLayer={(ctx) => (
          <MapLayerV2
            ctx={ctx}
            heartIds={heartIds}
            visitedIds={visitedIds}
            highlightIds={highlightIds}
            route={routeOverlay}
          />
        )}
      />

      {/* 위: 찾기 줄, 칩, 홀 버튼 */}
      <div
        className={clsx(
          "pointer-events-none absolute left-0 right-0 top-0 z-30 flex flex-col gap-v2-x2 px-v2-x4 pt-safe md:pt-v2-x4",
          q && "bottom-v2-x8",
        )}
      >
        <div ref={topRef} className="flex w-full flex-col gap-v2-x2">
          <div className="pointer-events-auto flex w-full max-w-[var(--roam-v2-size-content-max-width)] items-center gap-v2-x2">
            <BackButton
              fallbackHref="/"
              className="shrink-0 border border-v2-stroke-neutral-muted bg-v2-bg-layer-floating shadow-v2-s3"
            />
            <label className="flex min-w-0 flex-1 items-center gap-v2-x2 rounded-v2-pill border border-v2-stroke-neutral-muted bg-v2-bg-layer-floating px-v2-x3 py-v2-x2-5 shadow-v2-s3">
              <Search
                aria-hidden
                className="size-[var(--roam-v2-icon-size-md)] shrink-0 text-v2-fg-neutral"
              />
              <input
                type="text"
                enterKeyHint="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== "Enter" || !q) return;
                  track("search_submit", {
                    screen: SCREEN.map,
                    exhibitionSlug: slug,
                    props: { booth_count: results.length },
                  });
                  if (results.length === 0)
                    track("search_zero_result", {
                      screen: SCREEN.map,
                      exhibitionSlug: slug,
                    });
                }}
                placeholder={label.searchPlaceholder}
                aria-label={label.searchPlaceholder}
                className="min-w-0 flex-1 bg-v2-bg-transparent text-v2-t5 text-v2-fg-neutral outline-none placeholder:text-v2-fg-placeholder"
              />
              {query && (
                <button
                  type="button"
                  aria-label={label.clearSearch}
                  onClick={() => setQuery("")}
                  className="shrink-0 text-v2-fg-neutral-muted"
                >
                  <X
                    aria-hidden
                    className="size-[var(--roam-v2-icon-size-md)]"
                  />
                </button>
              )}
            </label>
          </div>

          {!q && amenityIds.length > 0 && (
            <div className="pointer-events-auto flex w-full max-w-[var(--roam-v2-size-content-max-width)] gap-v2-between-chips overflow-x-auto pb-v2-x1">
              {amenityIds.map((a) => {
                const Icon = AMENITY_ICON[a.id];
                const on = amenity === a.id;
                return (
                  <button
                    key={a.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => {
                      setAnswer(null);
                      pickAmenity(on ? null : a.id);
                    }}
                    className={clsx(
                      "flex shrink-0 items-center gap-v2-x1 rounded-v2-pill border px-v2-x2-5 py-v2-x1-5 text-v2-t4 font-v2-medium shadow-v2-s2",
                      on
                        ? "border-v2-stroke-brand-weak bg-v2-bg-brand-weak text-v2-fg-brand"
                        : "border-v2-stroke-neutral-muted bg-v2-bg-layer-floating text-v2-fg-neutral",
                    )}
                  >
                    <Icon
                      aria-hidden
                      className="size-[var(--roam-v2-icon-size-sm)]"
                    />
                    {a.title}
                  </button>
                );
              })}
            </div>
          )}

          {!q && (
            <div className="flex w-full justify-end">
              <HallSwitch
                halls={hallNames}
                current={hall}
                onPick={pickHall}
                className="pointer-events-auto"
              />
            </div>
          )}
        </div>

        {q && (
          <SearchResults
            query={query.trim()}
            results={results}
            hallOf={hallOf}
            onPick={(b, index) => {
              track("search_result_tap", {
                screen: SCREEN.map,
                exhibitionSlug: slug,
                boothId: b.id,
                props: { index },
              });
              setQuery("");
              setAmenity(null);
              select(b.id, "search");
              focusBooth(b.id);
            }}
          />
        )}
      </div>

      {/* 넓은 화면: 확대, 축소 */}
      <div className="absolute right-v2-x4 top-1/2 z-10 hidden -translate-y-1/2 flex-col gap-v2-x1 rounded-v2-pill bg-v2-bg-layer-floating p-v2-x1 shadow-v2-s3 md:flex">
        {(
          [
            ["zoom_in", "map_zoom_in", label.zoomIn, Plus],
            ["zoom_out", "map_zoom_out", label.zoomOut, Minus],
          ] as const
        ).map(([control, legacy, aria, Icon]) => (
          <button
            key={control}
            type="button"
            aria-label={aria}
            onClick={() => {
              trackUiClick({ exhibitionSlug: slug }, legacy);
              track("map_control", {
                screen: SCREEN.map,
                exhibitionSlug: slug,
                props: { control },
              });
              if (control === "zoom_in") mapRef.current?.zoomIn();
              else mapRef.current?.zoomOut();
            }}
            className="flex size-v2-x9 items-center justify-center rounded-v2-full text-v2-fg-neutral active:bg-v2-bg-transparent-pressed"
          >
            <Icon aria-hidden className="size-[var(--roam-v2-icon-size-md)]" />
          </button>
        ))}
      </div>

      {/* 아래: 부스 카드 또는 로미 줄 */}
      <div
        ref={bottomRef}
        className="pointer-events-none absolute inset-x-0 bottom-0 z-20 px-v2-x4 pb-safe md:pb-v2-x2"
      >
        <div className="w-full max-w-[var(--roam-v2-size-content-max-width)]">
          {q ? null : remembered ? (
            <div className="flex w-full flex-col pb-v2-x2">
              <RomiLineCard
                key={remembered.boothId}
                title={romi.visitRemembered(remembered.name)}
                sub={romi.visitLaterNote}
                onDone={clearRemembered}
                onAction={() => {
                  restoreRecord(remembered.boothId, remembered.before);
                  track("visit_undo", {
                    screen: SCREEN.visitRemembered,
                    exhibitionSlug: slug,
                    boothId: remembered.boothId,
                    props: { surface: "card" },
                  });
                  setRemembered(null);
                  setSelectedId(remembered.boothId);
                }}
              />
            </div>
          ) : showCard ? (
            <BoothCardV2
              onVisitMarked={(before) => {
                setRemembered({
                  boothId: selected.id,
                  name: selected.name,
                  before,
                });
                setSelectedId(null);
              }}
              key={selected.id}
              booth={selected}
              onRoute={
                canRoute && selected.code
                  ? () => startRoute(selected.id, "booth_card")
                  : undefined
              }
              arrivedLine={
                arrivedId === selected.id
                  ? system.arrivedLine(
                      label.hallNumber(hallOf(selected), selected.code),
                    )
                  : undefined
              }
              hallName={hallOf(selected)}
              categories={[catById.get(selected.categoryId)].filter(
                (c): c is NonNullable<typeof c> => !!c,
              )}
              exhibitionSlug={slug}
              className="w-full pb-v2-x2"
            />
          ) : routeCard ? (
            <div className="flex w-full flex-col pb-v2-x2">{routeCard}</div>
          ) : answer ? (
            <div className="flex w-full flex-col pb-v2-x2">
              <RomiCard
                title={answer.title}
                trailing={{
                  label: label.close,
                  onClick: () => {
                    setAnswer(null);
                    setAmenity(null);
                  },
                }}
              />
            </div>
          ) : (
            <div className="flex w-full flex-col items-center gap-v2-x2 pb-v2-x2">
              <Snackbar state={snack} onClose={closeSnack} className="w-full" />
              <div className="flex w-full items-center justify-center gap-v2-x2">
                <button
                  type="button"
                  aria-haspopup="dialog"
                  aria-label={`${romiLine}, ${label.romiSheet}`}
                  onClick={() => {
                    track("romi_sheet_open", {
                      screen: SCREEN.map,
                      exhibitionSlug: slug,
                      props: { from: "map_pill" },
                    });
                    setSheet("romi");
                  }}
                  className="pointer-events-auto flex items-center gap-v2-x2 rounded-v2-pill border border-v2-stroke-neutral-muted bg-v2-bg-layer-floating py-v2-x1 pl-v2-x1 pr-v2-x4 text-v2-t4 font-v2-medium text-v2-fg-neutral shadow-v2-s2 active:bg-v2-bg-layer-floating-pressed"
                >
                  <RomiAvatar size="sm" className="shadow-v2-s1" />
                  {romiLine}
                </button>
                {todayBooths.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setTodayOpen(true)}
                    className="pointer-events-auto flex min-h-v2-x9 shrink-0 items-center rounded-v2-pill border border-v2-stroke-neutral-muted bg-v2-bg-layer-floating px-v2-x3-5 text-v2-t4 font-v2-medium text-v2-fg-neutral shadow-v2-s2 active:bg-v2-bg-layer-floating-pressed"
                  >
                    {label.todayVisited}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
      {todayOpen && (
        <TodaySheet
          booths={todayBooths}
          exhibitionSlug={slug}
          onClose={() => setTodayOpen(false)}
          show={(x) => setSnack({ ...x, key: Date.now() })}
        />
      )}
      {sheet === "romi" && (
        <RomiSheet
          booths={booths}
          records={hydrated ? records : {}}
          hallOf={hallOf}
          exhibitionSlug={slug}
          isOpenDay={isOpenDay}
          canRoute={canRoute}
          facilities={amenityIds
            .filter((a) => ["toilet", "cafe", "restaurant"].includes(a.id))
            .map((a) => ({ id: a.id, title: a.title }))}
          onRoute={(id) => startRoute(id, "romi_sheet")}
          onFacility={(id) => {
            setSheet(null);
            setSelectedId(null);
            pickAmenity(id);
            const title = AMENITIES.find((a) => a.id === id)?.title ?? "";
            setAnswer({ title: romi.facilityMarked(title) });
          }}
          onWhereFound={(b) => {
            setSheet(null);
            setSelectedId(null);
            setAmenity(null);
            setAnswer({
              title: romi.whereFound(
                b.name,
                label.hallNumber(hallOf(b), b.code),
              ),
              boothId: b.id,
            });
            focusIds([b.id], 2.5);
          }}
          onDoneForToday={() => setSheet("recap")}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet === "recap" && (
        <RecapSheet
          slug={slug}
          fairName={detail.exhibition.name}
          stats={fairStats}
          signedIn={signedIn}
          onClose={() => setSheet(null)}
        />
      )}
      {route && (route.step === "pickTarget" || route.step === "askStart") && (
        <RouteSheet
          key={route.step}
          step={route.step}
          booths={booths}
          records={hydrated ? records : {}}
          floorplan={floorplan}
          hallOf={hallOf}
          targetId={route.targetId}
          exhibitionSlug={slug}
          onPickTarget={(id) =>
            setRoute({ ...route, targetId: id, step: "askStart" })
          }
          onPickStart={(id) => drawRoute(route, id)}
          onClose={() => setRoute(null)}
        />
      )}
    </div>
  );
}

function SearchResults({
  query,
  results,
  hallOf,
  onPick,
}: {
  query: string;
  results: BoothListItem[];
  hallOf: (b: BoothListItem) => string | undefined;
  onPick: (b: BoothListItem, index: number) => void;
}) {
  return (
    <section className="pointer-events-auto flex min-h-0 w-full max-w-[var(--roam-v2-size-content-max-width)] shrink flex-col overflow-hidden rounded-[var(--roam-v2-trial-radius-card-1)] border border-v2-stroke-neutral-muted bg-v2-bg-layer-floating shadow-v2-s2">
      {results.length === 0 ? (
        <div className="flex flex-col gap-v2-x1 p-v2-x4">
          <p className="text-v2-t5 font-v2-bold text-v2-fg-neutral">
            {system.searchEmptyTitle(query)}
          </p>
          <p className="text-v2-t4 text-v2-fg-neutral-muted">
            {system.searchEmptyBody}
          </p>
        </div>
      ) : (
        <>
          <p className="px-v2-x4 pb-v2-x1 pt-v2-x3 text-v2-t3 font-v2-medium text-v2-fg-neutral-muted">
            {system.searchCount(results.length)}
          </p>
          <ul className="overflow-y-auto pb-v2-x2">
            {results.slice(0, 50).map((b, i) => (
              <li key={b.id}>
                <button
                  type="button"
                  onClick={() => onPick(b, i)}
                  className="flex w-full flex-col items-start gap-v2-x0-5 px-v2-x4 py-v2-x2-5 text-left active:bg-v2-bg-layer-floating-pressed"
                >
                  <span className="text-v2-t5 font-v2-medium text-v2-fg-neutral">
                    {b.name}
                  </span>
                  <span className="text-v2-t3 font-v2-medium text-v2-fg-neutral-muted">
                    {label.hallNumber(hallOf(b), b.code)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
