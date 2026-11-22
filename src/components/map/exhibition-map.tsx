"use client";

import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from "react";
import { Minus, Plus, Maximize2, RotateCw } from "lucide-react";
import { cn, clamp } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { Category, Hall, Point, BoothListItem } from "@/lib/types";
import type { Floorplan } from "@/lib/floorplans";
import { aisleRoute } from "@/lib/aisle-route";
import { trackUiClick, type UiControl } from "@/lib/analytics/ui-controls";
import {
  CODE_LINE_HEIGHT,
  CODE_RATIO,
  labelBaseUnits,
  labelInner,
  layoutBoothLabel,
  NAME_LINE_HEIGHT,
  NAME_WIDTH,
} from "./booth-label";
import {
  BOTTOM_RESERVE_RATIO,
  clampAxis,
  entryPoint,
  readableScale,
} from "./map-entry";
import {
  cubicBezier,
  flingOffset,
  flingSettled,
  interpolateCamera,
  readMapMotion,
  releaseVelocity,
  sameCamera,
  zoomLevel,
  ZOOM_LEVEL_VAR,
  type Camera,
  type Easing,
  type MapMotion,
  type Sample,
} from "./map-camera";

/** 손 뗀 속도를 잴 때 보는 마지막 표본 폭(ms). 디자인 값이 아니라 입력 거르기 폭이다 — 이보다
 *  오래 멈춰 있다가 놓으면 미끄러지지 않는다. */
const VELOCITY_WINDOW_MS = 100;

// Fallback booth box when no floorplan geometry is supplied.
const BOOTH_W = 72;
const BOOTH_H = 62;
// Visual inset per booth so adjacent stands keep a gap (aisle) between them —
// the traced coordinates pack booths edge-to-edge.
const BOOTH_GAP = 3;
/** 홀 목록 기본값. 렌더마다 새 배열이면 홀 바닥판 메모가 매번 깨진다. */
const NO_HALLS: Hall[] = [];

/** 도면 데이터가 "색 없음"을 나타낼 때 쓰는 값. 디자인 색이 아니라 **데이터 센티넬**이라
 *  토큰으로 올리지 않는다 — 이 값이 보이면 존 색 대신 테두리 색으로 떨어뜨린다. */
const FLOORPLAN_NO_COLOR = "#d8dade";

/** Crowd heat steps, quiet → very busy. Distinct hues (yellow→red), not just one
 *  orange at varying opacity, so the four levels read apart at a glance. Drawn
 *  with mix-blend multiply so a booth's name still shows through the tint. */
// 색과 겹침 강도는 토큰이 준다(`heatmap.json`) — iOS `RoamHeatmap`과 같은 값이다.
// 예전엔 여기 hex를 박아 뒀고 iOS가 따로 들고 있어서, 한쪽만 고치면 조용히 갈렸다.
export const HEAT_TIERS = [
  {
    key: "여유",
    i18nKey: "crowdQuiet",
    fill: "var(--heatmap-fill-quiet)",
    opacity: "var(--heatmap-opacity-quiet)",
  },
  {
    key: "보통",
    i18nKey: "crowdModerate",
    fill: "var(--heatmap-fill-moderate)",
    opacity: "var(--heatmap-opacity-moderate)",
  },
  {
    key: "혼잡",
    i18nKey: "crowdBusy",
    fill: "var(--heatmap-fill-busy)",
    opacity: "var(--heatmap-opacity-busy)",
  },
  {
    key: "매우 혼잡",
    i18nKey: "crowdVeryBusy",
    fill: "var(--heatmap-fill-crowded)",
    opacity: "var(--heatmap-opacity-crowded)",
  },
] as const;

/** Unit vector from a toward b. */
function unit(a: { x: number; y: number }, b: { x: number; y: number }) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: dx / len, y: dy / len };
}

/** 도면 단위 상자(중심 x, y). */
export interface MapRect {
  x: number;
  y: number;
  w: number;
  h: number;
  color?: string;
  rotate?: number;
}

/**
 * 다른 그림 층(v2 지도)이 이 엔진의 이동, 확대, 누르기, 회전을 그대로 쓰면서 그림만 바꿀 때
 * 받는 것. 엔진은 하나로 두고(제스처와 화면 맞춤은 한 벌), 무엇을 그리는지만 넘긴다.
 */
export interface MapLayerContext {
  width: number;
  height: number;
  booths: BoothListItem[];
  floorplan?: Floorplan;
  /** 부스의 도면 상자. 도면이 있는데 그 부스가 도면에 없으면 null. */
  geomOf: (b: BoothListItem) => MapRect | null;
  /** 홀 바닥판(도면 또는 부스 범위). */
  hallRegions: { label: string; x: number; y: number; w: number; h: number }[];
  /** 지도가 돌아가도 글자가 서 있게 하는 변환. 0도면 undefined. */
  upright: (ax: number, ay: number) => string | undefined;
  selectedId?: string | null;
  /** 마지막으로 맞춘(들어올 때, 전체 보기) 배율. 사용자가 확대하면 바뀌지 않는다. 길잡이 표식(출입구,
   *  화장실)이 이 배율에서 읽히는 크기가 되게 쓴다. 맞추기 전에는 undefined. */
  fitScale?: number;
}

/** 바깥에서 지도를 움직이는 손잡이(웹 v2의 확대 버튼, 홀 바꾸기). */
export interface MapHandle {
  zoomIn: () => void;
  zoomOut: () => void;
  reset: () => void;
  /** 도면 상자 하나를 화면에 맞춘다(홀 바꾸기). x, y는 왼쪽 위. */
  /** 지금 화면 가운데의 도면 좌표(회전 0 기준). 편의시설 칩이 가장 가까운 곳을 고를 때 쓴다. */
  viewCenter: () => { x: number; y: number } | null;
  focusRect: (
    r: { x: number; y: number; w: number; h: number },
    /** atFit: 배율은 맞춘 배율(들어올 때) 그대로 두고 그 자리로 옮기기만 한다(편의시설 칩). 줄이면
     *  흩어진 표식을 담느라 지도가 점이 되고, 늘리면 주변을 잃는다. */
    opts?: {
      atFit?: boolean;
      /** 이 부스가 선택된 동안 떠 있는 것의 높이(safeInsets)가 바뀌면 같은 상자를 새 띠에 다시
       *  맞춘다. 카드가 뜨면서 아래 띠가 높아질 때 화면 쪽에서 한 번 더 부르지 않게 엔진이 맡는다.
       *  진행 중인 이동은 새로 시작하지 않고 목표만 바꿔 이어 간다. */
      keepWhileSelected?: string;
    },
  ) => void;
}

interface MapProps {
  /** 주면 v1 그림 대신 이 층을 그린다(엔진은 같다). */
  renderLayer?: (ctx: MapLayerContext) => ReactNode;
  /** 엔진의 v1 컨트롤(회전, 확대, 축소, 전체)을 숨긴다. */
  hideControls?: boolean;
  handleRef?: Ref<MapHandle>;
  /** 처음 들어올 때: "readable"(기본, 입구를 이름이 읽히는 배율로) 또는 "whole"(전체 맞춤).
   *  웹 v2는 "whole" — 11-16 결정 "지도 처음은 전체"(설문 10/18). */
  entry?: "readable" | "whole";
  width: number;
  height: number;
  booths: BoothListItem[];
  categories: Category[];
  halls?: Hall[];
  selectedId?: string | null;
  mustIds?: string[];
  curiousIds?: string[];
  passIds?: string[];
  goodIds?: string[];
  okIds?: string[];
  badIds?: string[];
  position?: Point | null;
  /** Hand-traced venue geometry; when set, booths render at exact rects. */
  floorplan?: Floorplan;
  /** Zoom to fill height (pan horizontally) instead of fitting the whole venue. */
  fillHeight?: boolean;
  /** Initial point to center on when fillHeight is set. */
  focus?: Point | null;
  onSelect?: (boothId: string) => void;
  onMapTap?: (p: Point) => void;
  /** Fired on pointer-down (to collapse overlays like the bottom sheet). */
  onInteractStart?: () => void;
  /** Fired when an actual pan/pinch movement begins (to hide map chrome). */
  onMoveStart?: () => void;
  /** Fired when a pan/pinch gesture ends (to restore map chrome after a beat). */
  onMoveEnd?: () => void;
  /** Booth id to pan-center on when it changes (e.g. a search result). */
  centerOn?: string | null;
  /** Portrait only: px height the bottom popup covers. A selected/centered booth
   *  is biased upward by this so it lands in the visible band above the popup,
   *  not hidden behind it. Ignored in landscape (popup sits at the side). */
  focusBottomInset?: number;
  /** Crowd heatmap: per-booth inclusion counts + per-corridor (pair) counts.
   *  When set, popular booths are tinted and busy corridors thickened. */
  heat?: Record<string, number>;
  heatPairs?: { from: string; to: string; count: number }[];
  className?: string;
  /** sessionStorage에 pan/zoom/rotation을 저장·복원할 키(보통 전시 slug). 없으면
   *  저장 안 함. 부스 상세로 나갔다 뒤로가기로 돌아오면 이 컴포넌트가 완전히
   *  리마운트되면서 view가 늘 처음(전체 보기)으로 리셋됐다 — 마지막으로 보던
   *  자리 그대로 이어지게 한다. */
  persistKey?: string;
  /** admin 버튼 인기도 집계용 — persistKey(스토리지 키)와 별개로, 클릭 이벤트를
   *  귀속시킬 전시를 명시한다. 없으면 계측만 조용히 스킵(지도 자체 동작은 영향 없음). */
  exhibitionSlug?: string;
  /** Insets the interactive/measured viewport (e.g. to clear an overlapping
   *  bottom sheet) so fit + clamp use the visible area, not the full container.
   *  Tailwind positioning classes; defaults to filling the container. */
  viewportClassName?: string;
  /** 지도 위에 떠 있는 것(위 찾기 줄과 칩, 아래 카드)이 가리는 높이(px). 주면 전체 보기,
   *  최소 배율, 칸 맞추기가 그 사이 띠를 화면으로 보고 맞춘다(iOS 안전 영역과 같은 뜻).
   *  지도 그림은 여전히 화면 전체에 그려져 떠 있는 것 밑으로 끌어 볼 수 있다. */
  safeInsets?: { top: number; bottom: number };
  /** Position for the zoom controls cluster — override to clear an overlapping
   *  bottom sheet / nav. Defaults to bottom-right. */
  controlsClassName?: string;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
  color?: string;
  rotate?: number;
}

export function ExhibitionMap({
  width: widthProp,
  height: heightProp,
  booths,
  categories,
  halls = NO_HALLS,
  selectedId,
  mustIds = [],
  curiousIds = [],
  passIds = [],
  goodIds = [],
  okIds = [],
  badIds = [],
  position,
  floorplan,
  fillHeight = false,
  focus,
  onSelect,
  onMapTap,
  onInteractStart,
  onMoveStart,
  onMoveEnd,
  centerOn,
  focusBottomInset = 0,
  heat,
  heatPairs,
  className,
  persistKey,
  exhibitionSlug,
  viewportClassName = "inset-0",
  controlsClassName = "bottom-4 right-3",
  renderLayer,
  hideControls = false,
  handleRef,
  entry = "readable",
  safeInsets,
}: MapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const safeRef = useRef({
    top: safeInsets?.top ?? 0,
    bottom: safeInsets?.bottom ?? 0,
  });
  const [fitScale, setFitScale] = useState<number | undefined>(undefined);
  /** 가려지지 않는 세로 띠: 위 끝 y와 높이. safeInsets가 없으면 화면 전체. */
  const band = (ch: number) => {
    const { top, bottom } = safeRef.current;
    const h = Math.max(ch * 0.3, ch - top - bottom);
    return { top: ch - h > 0 ? Math.min(top, ch - h) : 0, h };
  };
  const svgRef = useRef<SVGSVGElement>(null);
  const trackClick = (control: UiControl) =>
    trackUiClick({ exhibitionSlug }, control);
  // Effective canvas size: floorplan dims override the props when present.
  // (Declared early — the imperative transform/rotation helpers below need it.)
  const width = floorplan?.width ?? widthProp;
  const height = floorplan?.height ?? heightProp;
  // persistKey가 있으면 pan/zoom/rotation을 세션 동안 기억한다 — 부스 상세로
  // 나갔다 뒤로 오면 이 컴포넌트가 통째로 리마운트되는데, 그때 처음(전체 보기)이
  // 아니라 마지막으로 보던 자리로 되돌린다. 초기값을 lazy initializer로 직접
  // 읽어들인다(마운트 후 effect에서 setState하면 리렌더가 한 번 더 생긴다).
  const mapViewStorageKey = persistKey ? `roam-map-view-${persistKey}` : null;
  const savedView = useMemo(() => {
    if (!mapViewStorageKey || typeof window === "undefined") return null;
    try {
      const raw = sessionStorage.getItem(mapViewStorageKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as {
        scale: number;
        offset: Point;
        rotation: number;
      };
      if (
        typeof parsed.scale === "number" &&
        parsed.offset &&
        typeof parsed.rotation === "number"
      ) {
        return parsed;
      }
      return null;
    } catch {
      return null;
    }
    // 마운트 시점 한 번만 읽는다 — persistKey가 세션 중 바뀌는 경우는 없다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Live pan/zoom, driven imperatively so dragging never re-renders the (heavy)
  // booth layer — only the SVG transform changes on each move.
  const view = useRef<{ scale: number; offset: Point }>(
    savedView
      ? { scale: savedView.scale, offset: savedView.offset }
      : { scale: 1, offset: { x: 0, y: 0 } },
  );
  // Once the visitor pans/zooms/taps, stop auto-refitting on container resize
  // (chrome show/hide, status chips appearing) — keep their chosen view.
  const userAdjusted = useRef(!!savedView);
  const moveStartFired = useRef(false);
  // Map view rotation in 90° steps. Stored as an ever-increasing degree count so
  // each press animates forward a quarter turn (270°→360°, not 270°→0°). The
  // whole map (booths + their labels) rotates rigidly, so nothing overflows its
  // box; footprint() uses this mod 180 to know if width/height are swapped.
  const rotationRef = useRef(savedView?.rotation ?? 0);
  const [rotation, setRotation] = useState(savedView?.rotation ?? 0);
  const persistView = useCallback(() => {
    if (!mapViewStorageKey || typeof window === "undefined") return;
    try {
      sessionStorage.setItem(
        mapViewStorageKey,
        JSON.stringify({
          scale: view.current.scale,
          offset: view.current.offset,
          rotation: rotationRef.current,
        }),
      );
    } catch {
      // storage 꽉 참/비활성화 — 이번 방문에서는 그냥 기억 못 한다.
    }
  }, [mapViewStorageKey]);
  const restoredView = useRef(!!savedView);
  // Counter-rotate a label around its own anchor so it stays upright (readable)
  // while the map turns — the anchor is the pivot, so the text doesn't drift,
  // only its orientation is cancelled. Returns undefined at 0° (no transform).
  const upright = useCallback(
    (ax: number, ay: number): string | undefined =>
      rotation % 360 === 0 ? undefined : `rotate(${-rotation} ${ax} ${ay})`,
    [rotation],
  );

  // Vertical pan target that keeps a focused booth above the bottom popup.
  // Portrait: shift up by half the popup inset (capped so it never overshoots);
  // landscape: no bias (popup sits at the side, doesn't cover the map bottom).
  function focusCenterY(el: HTMLElement, gy: number, scale: number): number {
    const cw = el.clientWidth;
    const ch = el.clientHeight;
    const landscape = cw > ch * 1.4;
    const bias = landscape ? 0 : Math.min(focusBottomInset, ch * 0.5);
    return (ch - bias) / 2 - gy * scale;
  }

  // ---- 카메라: 한 곳에서, 한 루프로 ----
  // `view` + `rotationRef`는 목표(논리) 카메라다. 맞추기, 가두기, 부스로 가기는 여기에 목표를 쓴다.
  // `shown`은 지금 화면에 그려진 카메라다. 이동 요청은 requestAnimationFrame 루프 하나가 `shown`에서
  // 목표까지 보간한다(map-move 토큰 길이와 곡선). 진행 중에 새 요청이 오면 지금 보이는 자리에서
  // 이어 받는다. CSS transition은 쓰지 않는다 — 두 체계가 섞이면 겹친 전환이 서로를 끊는다.
  const shown = useRef<Camera>(
    savedView
      ? { scale: savedView.scale, offset: savedView.offset, rotation: savedView.rotation }
      : { scale: 1, offset: { x: 0, y: 0 }, rotation: 0 },
  );
  // 루프가 돌리는 움직임은 둘이다. curve = 목표까지 곡선으로(map-move, 경계 정착),
  // fling = 손으로 튕긴 뒤 감속(decay.map-fling). 둘 다 같은 requestAnimationFrame 루프 하나가 돈다.
  const anim = useRef<
    | {
        kind: "curve";
        from: Camera;
        to: Camera;
        start: number;
        duration: number;
        ease: Easing;
      }
    | {
        kind: "fling";
        /** 이 시각의 카메라. 지도 끝을 넘으면 done과 함께 안으로 정착할 자리(settleTo)를 준다. */
        step: (now: number) => { cam: Camera; done: boolean; settleTo?: Camera };
      }
    | null
  >(null);
  const frame = useRef<number | null>(null);
  // 마지막 프로그램 초점 요청(focusRect). 여백이 바뀌면 같은 상자를 다시 맞추는 데 쓴다.
  // 사용자가 지도를 직접 움직이면 지운다.
  const lastFocus = useRef<{
    r: { x: number; y: number; w: number; h: number };
    opts?: Parameters<MapHandle["focusRect"]>[1];
  } | null>(null);

  const zoomLevelRef = useRef<number | null>(null);
  const targetCamera = (): Camera => ({
    scale: view.current.scale,
    offset: view.current.offset,
    rotation: rotationRef.current,
  });
  const readMotion = useCallback((): MapMotion | null => {
    const el = containerRef.current;
    if (!el || typeof window === "undefined") return null;
    const reduce =
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    return readMapMotion(el, reduce);
  }, []);

  // 지금 보이는 카메라를 DOM에 쓴다. 바뀌는 건 SVG의 transform 하나와(부스 층은 다시 그리지 않는다)
  // 라벨 단계 변수 하나(단계가 바뀔 때만)다.
  const writeShown = useCallback(() => {
    const el = svgRef.current;
    if (!el) return;
    const { scale, offset, rotation: deg } = shown.current;
    const cx = width / 2;
    const cy = height / 2;
    // Pan → zoom → rotate-about-centre (transform-origin is 0 0, so the rotation
    // is centred manually). Booth boxes and their labels rotate together.
    el.style.transform = `translate(${offset.x}px, ${offset.y}px) scale(${scale}) translate(${cx}px, ${cy}px) rotate(${deg}deg) translate(${-cx}px, ${-cy}px)`;
    const level = zoomLevel(scale);
    if (level !== zoomLevelRef.current) {
      zoomLevelRef.current = level;
      el.style.setProperty(ZOOM_LEVEL_VAR, String(level));
    }
  }, [width, height]);

  // 움직이는 동안만 합성 층으로 올린다. 늘 `will-change: transform`이면 브라우저가 처음 그린 비트맵을
  // 키워 보여서 확대한 뒤 글자가 흐리다. 멈추면 풀어서 그 배율로 선명하게 다시 그린다.
  const setMoving = useCallback((on: boolean) => {
    const el = svgRef.current;
    if (el) el.style.willChange = on ? "transform" : "auto";
  }, []);

  // 진행 중인 이동을 지금 보이는 자리에서 멈추고 목표를 그 자리로 맞춘다(손이 닿으면 거기서 잡는다).
  const stopCamera = useCallback(() => {
    if (frame.current != null) cancelAnimationFrame(frame.current);
    frame.current = null;
    if (!anim.current) return;
    anim.current = null;
    shown.current = { ...shown.current, rotation: rotationRef.current };
    view.current = { scale: shown.current.scale, offset: shown.current.offset };
    writeShown();
  }, [writeShown]);

  /** 곡선 움직임 하나. 토큰을 못 읽었거나 길이가 0이면(동작 줄이기) null — 부르는 쪽이 바로 옮긴다. */
  const curveTo = useCallback(
    (to: Camera, kind: "move" | "settle") => {
      const m = readMotion();
      const spec = m ? (kind === "move" ? m.move : m.settle) : null;
      if (!spec || !(spec.duration > 0) || !spec.curve) return null;
      if (sameCamera(shown.current, to)) return null;
      return {
        kind: "curve" as const,
        from: shown.current,
        to,
        start: performance.now(),
        duration: spec.duration,
        ease: cubicBezier(spec.curve),
      };
    },
    [readMotion],
  );

  /** 루프가 안 돌고 있으면 돌린다. 돌고 있으면 바뀐 anim을 다음 프레임부터 이어 받는다. */
  const runLoop = useCallback(() => {
    setMoving(true);
    if (frame.current != null) return;
    const finish = () => {
      frame.current = null;
      anim.current = null;
      setMoving(false);
      persistView();
    };
    const loop = (now: number) => {
      const a = anim.current;
      if (!a) {
        frame.current = null;
        return;
      }
      if (a.kind === "curve") {
        const t = Math.min(1, Math.max(0, (now - a.start) / a.duration));
        shown.current =
          t >= 1 ? a.to : interpolateCamera(a.from, a.to, a.ease(t));
        writeShown();
        if (t < 1) frame.current = requestAnimationFrame(loop);
        else finish();
        return;
      }
      const r = a.step(now);
      shown.current = r.cam;
      view.current = { scale: r.cam.scale, offset: r.cam.offset };
      writeShown();
      if (!r.done) {
        frame.current = requestAnimationFrame(loop);
        return;
      }
      if (r.settleTo) {
        // 지도 끝을 넘었다 — 그 자리에서 안쪽으로 정착한다(같은 루프에서 이어서).
        view.current = { scale: r.settleTo.scale, offset: r.settleTo.offset };
        const next = curveTo(r.settleTo, "settle");
        if (next) {
          anim.current = next;
          frame.current = requestAnimationFrame(loop);
          return;
        }
        shown.current = r.settleTo;
        writeShown();
      }
      finish();
    };
    frame.current = requestAnimationFrame(loop);
  }, [curveTo, writeShown, setMoving, persistView]);

  /** 지금 보이는 자리에서 `to`까지 보간한다. move = map-move 곡선, settle = 경계 밖에서 안으로 정착. */
  const startCamera = useCallback(
    (to: Camera, kind: "move" | "settle") => {
      const next = curveTo(to, kind);
      if (!next) {
        // 동작 줄이기(map-move: 즉시)나 토큰을 못 읽으면 바로 그 자리로.
        if (frame.current != null) cancelAnimationFrame(frame.current);
        frame.current = null;
        anim.current = null;
        shown.current = to;
        writeShown();
        setMoving(false);
        persistView();
        return;
      }
      anim.current = next;
      runLoop();
    },
    [curveTo, runLoop, writeShown, setMoving, persistView],
  );

  /**
   * 목표 카메라(view + rotationRef)를 화면에 낸다.
   * - false: 바로(끌기, 핀치, 휠). 진행 중인 이동은 끊는다.
   * - true: 지금 보이는 자리에서 map-move로 보간한다.
   * - "retarget": 진행 중인 이동이 있으면 시작 시각과 출발점은 두고 목표만 바꾼다(여백이 바뀌어
   *   같은 곳을 새 띠에 다시 맞출 때). 없으면 바로.
   */
  const applyView = useCallback(
    (animate: boolean | "retarget" = false) => {
      const to = targetCamera();
      if (animate === "retarget") {
        if (anim.current?.kind === "curve") {
          anim.current.to = to;
          return;
        }
        animate = false;
      }
      if (animate) {
        startCamera(to, "move");
        return;
      }
      if (frame.current != null) cancelAnimationFrame(frame.current);
      frame.current = null;
      anim.current = null;
      shown.current = to;
      writeShown();
    },
    [startCamera, writeShown],
  );
  // React가 다시 그린 뒤에도 지금 보이는 카메라를 다시 적는다(인라인 스타일이 지워졌을 때 대비).
  const reassertTransform = writeShown;
  useEffect(
    () => () => {
      if (frame.current != null) cancelAnimationFrame(frame.current);
    },
    [],
  );
  // Active touch/mouse points for pan (1) + pinch (2) gestures.
  const pointers = useRef<Map<number, Point>>(new Map());
  const gesture = useRef<{
    mode: "pan" | "pinch";
    startOffset: Point;
    startScale: number;
    startDist: number;
    /** Pinch focal point in world (map) coordinates. */
    focalWorld: Point;
    /** Pan: pointer position at gesture start (container coords). */
    startPoint: Point;
    moved: boolean;
  } | null>(null);
  const lastTap = useRef<{ t: number; x: number; y: number }>({
    t: 0,
    x: 0,
    y: 0,
  });
  /** 한 손가락 끌기의 최근 포인터 표본(손 뗀 속도를 잰다). */
  const samples = useRef<Sample[]>([]);
  const wheelIdle = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (wheelIdle.current) clearTimeout(wheelIdle.current);
    },
    [],
  );

  // Axis-aligned footprint of the (possibly rotated) map, in world units. At 90°
  // / 270° the width and height swap — fit + clamp use this to frame and bound
  // the rotated map correctly. Rotation always pivots about the map centre, so
  // that centre stays fixed regardless of angle.
  const footprint = useCallback(() => {
    const r = ((rotationRef.current % 180) + 180) % 180;
    return r === 90 ? { fw: height, fh: width } : { fw: width, fh: height };
  }, [width, height]);

  // World ↔ rotated-content mapping. The CSS transform rotates the map about its
  // centre, so pan/zoom (screen-space) stay correct, but anything mapping a
  // booth's world x/y to the screen — tap hit-testing, centre-on — must apply
  // the same rotation. `toContent` rotates a world point into the post-rotation
  // frame; `fromContent` inverts it.
  const spin = (dx: number, dy: number, deg: number): Point => {
    const a = (deg * Math.PI) / 180;
    const c = Math.cos(a);
    const s = Math.sin(a);
    return { x: dx * c - dy * s, y: dx * s + dy * c };
  };
  const toContent = useCallback(
    (w: Point): Point => {
      const cx = width / 2;
      const cy = height / 2;
      const r = spin(w.x - cx, w.y - cy, rotationRef.current);
      return { x: cx + r.x, y: cy + r.y };
    },
    [width, height],
  );
  const fromContent = useCallback(
    (p: Point): Point => {
      const cx = width / 2;
      const cy = height / 2;
      const r = spin(p.x - cx, p.y - cy, -rotationRef.current);
      return { x: cx + r.x, y: cy + r.y };
    },
    [width, height],
  );

  // Booth geometry: from the floorplan (by code) when available, else a
  // uniform fallback box at the booth's stored x/y.
  // 도면 상자는 부스마다 한 번만 만든다. 같은 객체를 돌려줘야 부스 칸(memo)이 카메라나 홀이 바뀔 때
  // 다시 그려지지 않는다.
  const rectByCode = useMemo(
    () => new Map((floorplan?.booths ?? []).map((fb) => [fb.code, fb])),
    [floorplan],
  );
  const geomById = useMemo(() => {
    const make = (b: BoothListItem): Rect => {
      const fb = b.code ? rectByCode.get(b.code) : undefined;
      return fb
        ? {
            x: fb.x,
            y: fb.y,
            w: fb.w,
            h: fb.h,
            color: fb.color,
            rotate: fb.rotate,
          }
        : { x: b.x, y: b.y, w: BOOTH_W, h: BOOTH_H };
    };
    return { make, byId: new Map(booths.map((b) => [b.id, make(b)])) };
  }, [booths, rectByCode]);
  const geomOf = useCallback(
    (b: BoothListItem): Rect => geomById.byId.get(b.id) ?? geomById.make(b),
    [geomById],
  );
  const layerGeomOf = useCallback(
    (b: BoothListItem): MapRect | null =>
      floorplan && !(b.code && rectByCode.has(b.code)) ? null : geomOf(b),
    [floorplan, rectByCode, geomOf],
  );

  const catById = new Map(categories.map((c) => [c.id, c]));
  const boothById = new Map(booths.map((b) => [b.id, b]));
  const mustSet = new Set(mustIds);
  const curiousSet = new Set(curiousIds);
  const passSet = new Set(passIds);
  const goodSet = new Set(goodIds);
  const okSet = new Set(okIds);
  const badSet = new Set(badIds);
  // Paint the selected booth LAST so its name label (drawn above the rect) is
  // never covered by a booth sitting above it in document order.
  const renderBooths = selectedId
    ? [
        ...booths.filter((b) => b.id !== selectedId),
        ...booths.filter((b) => b.id === selectedId),
      ]
    : booths;
  // Hall containers. From the floorplan when present; otherwise a bounding box
  // computed from booth positions.
  const hallRegions = useMemo(() => floorplan
    ? floorplan.halls.map((h) => ({
        label: h.name,
        x: h.x,
        y: h.y,
        w: h.w,
        h: h.h,
      }))
    : halls
        .map((hall) => {
          const inHall = booths.filter((b) => b.hallId === hall.id);
          if (inHall.length === 0) return null;
          const xs = inHall.map((b) => b.x);
          const ys = inHall.map((b) => b.y);
          const padX = BOOTH_W / 2 + 16;
          const padTop = BOOTH_H / 2 + 34;
          const padBot = BOOTH_H / 2 + 16;
          const x = Math.min(...xs) - padX;
          const y = Math.min(...ys) - padTop;
          return {
            label: hall.name,
            x,
            y,
            w: Math.max(...xs) + padX - x,
            h: Math.max(...ys) + padBot - y,
          };
        })
        .filter(
          (
            r,
          ): r is {
            label: string;
            x: number;
            y: number;
            w: number;
            h: number;
          } => r !== null,
        ), [floorplan, halls, booths]);

  // 들어올 때의 배율 — 보통 부스의 코드가 11px로 보이는 배율(`map-entry.ts`).
  // 도면이 없으면(부스 좌표만 있는 전시) 예전처럼 맞춤으로 들어온다.
  const entryScaleBase = useMemo(
    () => (floorplan ? readableScale(floorplan.booths, 0) : null),
    [floorplan],
  );
  // 확대 상한 — 진입 배율보다 더 들여다볼 여지를 남긴다(iOS: 진입 × 4, 최소 12배.
  // 웹은 도면 1단위 = 1px 기준이라 4가 기본).
  const maxScale = useCallback(
    () => Math.max(4, (entryScaleBase ?? 0) * 3),
    [entryScaleBase],
  );

  // Fit map to container. Guards against 0-size (layout not ready).
  // `whole`: "전체 보기"·회전 — 도면 전체를 맞춘다. 아니면(처음 들어올 때) 도면이
  // 있는 전시는 입구를 보며 이름이 읽히는 배율로 들어온다.
  const fit = useCallback(
    (animate = false, whole = false) => {
      const el = containerRef.current;
      if (!el) return;
      const cw = el.clientWidth;
      const ch = el.clientHeight;
      if (cw < 2 || ch < 2) return;
      // After the visitor has taken control, a resize (chrome hiding, status
      // chips appearing) must NOT snap back to the fitted view — just re-clamp
      // so their pan/zoom stays within the new bounds.
      const { fw, fh } = footprint();
      if (userAdjusted.current) {
        // 되돌아와 저장된 보기를 복원했거나 사용자가 움직였어도, 길잡이 표식 크기와 편의시설 초점이
        // 기대는 "맞춘 배율"은 알아야 한다(처음 들어올 때와 같은 계산).
        const band0 = band(ch);
        const contain0 = Math.min(cw / fw, band0.h / fh) * 0.96;
        setFitScale(
          entry === "whole"
            ? Math.max(contain0, (band0.h / fh) * 0.96)
            : contain0,
        );
        const s = view.current.scale;
        const o = view.current.offset;
        view.current.offset = {
          x: fw * s <= cw ? (cw - fw * s) / 2 : clamp(o.x, cw - fw * s, 0),
          y: fh * s <= ch ? (ch - fh * s) / 2 : clamp(o.y, ch - fh * s, 0),
        };
        // 이동 중에 크기가 바뀌면(크롬이 숨고 나타날 때) 이동을 끊고 뛰지 않게 목표만 바꾼다.
        applyView(animate || "retarget");
        persistView();
        return;
      }
      const safe = band(ch);
      const contain = Math.min(cw / fw, safe.h / fh) * 0.96;
      if (
        !whole &&
        entry !== "whole" &&
        !focus &&
        floorplan &&
        entryScaleBase != null
      ) {
        const fill = fillHeight ? Math.max(contain, (ch / fh) * 0.92) : contain;
        const s = Math.max(entryScaleBase, fill);
        const p = toContent(entryPoint(floorplan));
        // 입구는 크롬과 하단 띠(카드·칩) 사이 가운데에 둔다. 가장자리 입구가
        // 하단 띠 밑에 깔리지 않게, 그 띠만큼은 도면 끝이 화면 안으로 들어와도 된다.
        const reserve = ch * BOTTOM_RESERVE_RATIO;
        view.current = {
          scale: s,
          offset: {
            x: clampAxis(cw / 2 - p.x * s, cw, fw * s),
            y: clampAxis((ch - reserve) / 2 - p.y * s, ch, fh * s, reserve),
          },
        };
        setFitScale(s);
        applyView(animate || "retarget");
        persistView();
        return;
      }
      // fillHeight: zoom so the map fills the viewport vertically (pan horizontally),
      // but never below the contain scale.
      // 처음 "전체"로 들어올 때(웹 v2)는 가려지지 않는 띠의 세로를 채운다(iOS 진입과 같은 "세로 채움").
      // 가로로 긴 배치도를 다 맞추면 390에서 띠의 3분의 1만 쓰고 칸이 점이 된다(W3 검토).
      // 넘치는 가로는 옆으로 밀어 본다. 입구가 있으면 입구 쪽을 가운데에 둔다.
      // "전체 보기" 버튼(whole)은 지금처럼 다 들어오게 맞춘다.
      const fillBand = entry === "whole" && !whole && !focus;
      const s = fillBand
        ? Math.max(contain, (safe.h / fh) * 0.96)
        : fillHeight
          ? Math.max(contain, (ch / fh) * 0.92)
          : contain;
      // Centre formula pivots on the map centre (width/2,height/2) — the same
      // point the rotation turns about — so it holds at every angle.
      const cx = focus
        ? focus.x
        : fillBand && floorplan
          ? toContent(entryPoint(floorplan)).x
          : width / 2;
      const cy = focus ? focus.y : height / 2;
      const scaledH = fh * s;
      view.current = {
        scale: s,
        offset: {
          x: clamp(
            cw / 2 - cx * s,
            Math.min(0, cw - fw * s),
            Math.max(0, cw - fw * s),
          ),
          // When the whole map is shorter than the viewport, anchor it near the
          // top (not vertical-centred) so there's no large empty band above.
          y:
            !focus && scaledH < ch
              ? entry === "whole"
                ? safe.top + (safe.h - scaledH) / 2
                : 12
              : clamp(
                  ch / 2 - cy * s,
                  Math.min(0, ch - scaledH),
                  Math.max(0, ch - scaledH),
                ),
        },
      };
      setFitScale(s);
      applyView(animate || "retarget");
      persistView();
    },
    // focus is depended on by its x/y (object identity may churn each render).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      width,
      height,
      fillHeight,
      focus?.x,
      focus?.y,
      floorplan,
      entryScaleBase,
      entry,
      toContent,
      applyView,
      footprint,
      persistView,
    ],
  );

  // The explicit "전체 보기" control: drop the user-adjusted lock and re-fit —
  // rotation included, since "전체 보기" reads as "처음 화면으로". Turn the short
  // way to the nearest upright angle (90°→0°, 270°→360°) — never three
  // quarter-turns.
  const resetView = useCallback(() => {
    const upright = Math.round(rotationRef.current / 360) * 360;
    if (upright !== rotationRef.current) {
      rotationRef.current = upright;
      setRotation(upright);
    }
    userAdjusted.current = false;
    lastFocus.current = null;
    fit(true, true);
  }, [fit]);

  // Rotate the whole map a quarter-turn. Re-fit afterwards so the rotated map is
  // re-centred and scaled to the viewport — it can never spill off-screen, and
  // the transform transition makes the turn animate smoothly.
  const rotate90 = useCallback(() => {
    rotationRef.current += 90;
    setRotation(rotationRef.current);
    userAdjusted.current = false;
    lastFocus.current = null;
    fit(true, true);
  }, [fit]);

  // Re-fit whenever the container is (re)sized — handles late layout, rotation, etc.
  // 복원된 view가 있으면(위 lazy initializer에서 이미 state에 반영됨) fit()을
  // 건너뛰고 그 값을 그대로 그린다 — 되돌아왔을 때 처음 보던 자리 그대로,
  // 전체 보기로 다시 리셋되지 않는다.
  // layout effect: 첫 그림 전에 맞춘다(라벨 단계가 배율 1에서 맞춘 배율로 한 번 넘어가며 깜빡이지 않게).
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    if (restoredView.current) {
      applyView();
    } else {
      fit();
    }
    const ro = new ResizeObserver(() => fit());
    ro.observe(el);
    return () => ro.disconnect();
  }, [fit, applyView]);

  // 지도 위 제스처는 지도만 움직인다 — 페이지가 확대되면 안 된다.
  //
  // 지도는 pan/pinch를 pointer 이벤트로 직접 구현하는데, 브라우저가 그 전에 터치
  // 제스처를 가져가 **페이지 전체**를 확대해버렸다(양옆이 잘리는 그 증상). 막는 건
  // 세 겹이다:
  //  1) touch-action: none — 두 손가락 확대·더블탭 확대를 이 엘리먼트에서 끈다.
  //  2) gesturestart/change — 사파리 비표준 확대 이벤트. touch-action만으론 iOS에서
  //     페이지 확대가 남는 경우가 있다. 다른 브라우저엔 없는 이벤트라 무해하다.
  //  3) wheel(passive:false) — 트랙패드 핀치(ctrl+wheel)의 페이지 확대. React의
  //     onWheel은 루트에 passive로 붙어 preventDefault가 먹지 않으므로 직접 건다.
  // 지도 밖에서는 확대가 그대로 된다 — 전역 user-scalable=no는 쓰지 않는다(iOS는
  // 무시하고, 글자를 키워야 하는 사용자를 앱 전체에서 막는다).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const stop = (e: Event) => e.preventDefault();
    el.addEventListener("gesturestart", stop);
    el.addEventListener("gesturechange", stop);
    el.addEventListener("wheel", stop, { passive: false });
    return () => {
      el.removeEventListener("gesturestart", stop);
      el.removeEventListener("gesturechange", stop);
      el.removeEventListener("wheel", stop);
    };
  }, []);

  // The SVG transform is driven imperatively (not via JSX style), so any
  // re-render that recreates inline styles would otherwise drop it. Re-assert
  // the current view after every render — cheap (one style write).
  useLayoutEffect(() => {
    reassertTransform();
  });

  // Keep the map from disappearing off-screen, but don't pin edges flush to
  // the viewport border either — booths right at the map's edge used to be
  // stuck at the very edge of the screen (hard to see fully, hard to tap).
  // Allow overscroll up to half the viewport on each axis, so any edge can be
  // dragged in as far as the viewport's center. When the scaled map is
  // smaller than the viewport on an axis (fully zoomed out), still centre it
  // on that axis instead of pinning it to a corner.
  const clampOffset = useCallback(
    (off: Point, s: number): Point => {
      const el = containerRef.current;
      if (!el) return off;
      const cw = el.clientWidth;
      const ch = el.clientHeight;
      const { fw, fh } = footprint();
      const marginX = cw / 2;
      const marginY = ch / 2;
      const safe = band(ch);
      return {
        x:
          fw * s <= cw
            ? (cw - fw * s) / 2
            : clamp(off.x, cw - fw * s - marginX, marginX),
        y:
          fh * s <= safe.h
            ? safe.top + (safe.h - fh * s) / 2
            : clamp(off.y, ch - fh * s - marginY, marginY),
      };
    },
    [footprint],
  );

  // Lowest zoom we allow: enough to frame the whole venue (its contain scale),
  // or 0.3 — whichever is smaller. The old hard 0.3 floor blocked zoom-out on
  // large floorplans whose contain scale falls below 0.3, so the full map could
  // never be framed.
  const minScale = useCallback(() => {
    const el = containerRef.current;
    if (!el) return 0.3;
    const { fw, fh } = footprint();
    const contain =
      Math.min(el.clientWidth / fw, band(el.clientHeight).h / fh) * 0.96;
    return Math.min(0.3, contain);
  }, [footprint]);

  // Zoom by a factor, keeping the given container-point fixed (defaults to center).
  const zoomBy = useCallback(
    (factor: number, focal?: Point, animate = false) => {
      const el = containerRef.current;
      if (!el) return;
      const fx = focal?.x ?? el.clientWidth / 2;
      const fy = focal?.y ?? el.clientHeight / 2;
      const prev = view.current.scale;
      const next = clamp(prev * factor, minScale(), maxScale());
      const o = view.current.offset;
      view.current = {
        scale: next,
        offset: clampOffset(
          {
            x: fx - ((fx - o.x) / prev) * next,
            y: fy - ((fy - o.y) / prev) * next,
          },
          next,
        ),
      };
      userAdjusted.current = true;
      lastFocus.current = null;
      applyView(animate);
      persistView();
    },
    [clampOffset, applyView, minScale, maxScale, persistView],
  );

  /** 상자 하나를 화면에 맞춘다. "refit"은 여백이 바뀌어 같은 상자를 다시 맞출 때 — 진행 중이면
   *  목표만 바꾸고, 끝났으면 새로 옮긴다. */
  const focusTo = useCallback(
    (
      r: { x: number; y: number; w: number; h: number },
      opts: Parameters<MapHandle["focusRect"]>[1],
      mode: "move" | "refit" = "move",
    ) => {
      const el = containerRef.current;
      if (!el) return;
      const cw = el.clientWidth;
      const ch = el.clientHeight;
      const c = toContent({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
      const safe = band(ch);
      const want =
        Math.min(cw / r.w, (safeInsets ? safe.h : ch) / r.h) * 0.92;
      if (opts?.atFit && fitScale) {
        // 맞춘 배율에 머문다. 들어올 때처럼 도면이 띠 밖으로 빈 곳을 보이지 않게 가둔다(여분 여백 없음).
        const { fw, fh } = footprint();
        const sF = fitScale;
        view.current = {
          scale: sF,
          offset: {
            x: clamp(
              cw / 2 - c.x * sF,
              Math.min(0, cw - fw * sF),
              Math.max(0, cw - fw * sF),
            ),
            y:
              fh * sF <= safe.h
                ? safe.top + (safe.h - fh * sF) / 2
                : clamp(
                    safe.top + safe.h / 2 - c.y * sF,
                    safe.top + safe.h - fh * sF,
                    safe.top,
                  ),
          },
        };
      } else {
        const s = clamp(want, minScale(), maxScale());
        const y = safeInsets
          ? safe.top + safe.h / 2 - c.y * s
          : focusCenterY(el, c.y, s);
        view.current = {
          scale: s,
          offset: clampOffset({ x: cw / 2 - c.x * s, y }, s),
        };
      }
      userAdjusted.current = true;
      applyView(mode === "refit" && anim.current ? "retarget" : true);
      persistView();
    },
    // focusCenterY와 band는 렌더마다 새로 만드는 함수라 뺀다(focusBottomInset과 safeRef만 읽는다).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      fitScale,
      toContent,
      minScale,
      maxScale,
      clampOffset,
      applyView,
      persistView,
      focusBottomInset,
      safeInsets,
      footprint,
    ],
  );

  useImperativeHandle(
    handleRef,
    () => ({
      zoomIn: () => zoomBy(1.25, undefined, true),
      zoomOut: () => zoomBy(0.8, undefined, true),
      reset: () => resetView(),
      viewCenter: () => {
        const el = containerRef.current;
        if (!el) return null;
        const { scale: sc, offset: o } = view.current;
        return {
          x: (el.clientWidth / 2 - o.x) / sc,
          y: (el.clientHeight / 2 - o.y) / sc,
        };
      },
      focusRect: (r, opts) => {
        lastFocus.current = { r, opts };
        focusTo(r, opts);
      },
    }),
    [zoomBy, resetView, focusTo],
  );

  // 떠 있는 것의 높이가 바뀌면(카드가 뜨고 칩 줄이 접히면) 띠를 새로 잡는다. 사용자가
  // 아직 지도를 움직이지 않았으면 전체 보기를 그 띠에 다시 맞춘다.
  // 사용자가 움직였는데 마지막 요청이 "이 부스가 선택된 동안 띠에 맞춰 둬"(focusRect의
  // keepWhileSelected)였으면, 같은 상자를 새 띠에 다시 맞춘다. 화면 쪽에서 focusRect를 한 번 더
  // 부르면 전환이 둘 겹쳤다(2026-11-21 분석). 여기선 진행 중인 이동의 목표만 바꿔 한 번의 이동으로 끝난다.
  useEffect(() => {
    safeRef.current = {
      top: safeInsets?.top ?? 0,
      bottom: safeInsets?.bottom ?? 0,
    };
    if (!restoredView.current && !userAdjusted.current) {
      fit();
      return;
    }
    const f = lastFocus.current;
    if (f?.opts?.keepWhileSelected && f.opts.keepWhileSelected === selectedId)
      focusTo(f.r, f.opts, "refit");
    // selectedId는 여백이 바뀐 그 순간의 값만 본다(선택이 바뀔 때 다시 맞추지 않는다).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safeInsets?.top, safeInsets?.bottom, fit]);

  // 손을 놓은 뒤: 손 뗀 속도로 출발해 v(t) = v0·e^(−t/τ)로 감속한다(decay.map-fling, τ 토큰).
  // map-move(300ms)와 묶지 않는다 — 길이가 손가락 속도에 따라 달라진다. 지도 끝을 넘으면 그 자리에서
  // 안쪽으로 정착한다(정착 곡선). 동작 줄이기면 관성 없이 그 자리에 멈춘다. 확대 배율은 손 뗀 그대로다.
  function settleAfterRelease(v: Point) {
    const tau = readMotion()?.flingTau ?? 0;
    const s = view.current.scale;
    const o0 = view.current.offset;
    const rot = rotationRef.current;
    const inside = clampOffset(o0, s);
    const outside =
      Math.abs(inside.x - o0.x) > 0.5 || Math.abs(inside.y - o0.y) > 0.5;
    if (!(tau > 0) || flingSettled(v, tau, 0)) {
      if (outside) {
        view.current = { scale: s, offset: inside };
        startCamera(targetCamera(), "settle");
        return;
      }
      setMoving(false);
      persistView();
      return;
    }
    const t0 = performance.now();
    anim.current = {
      kind: "fling",
      step: (now) => {
        const t = Math.max(0, now - t0);
        const d = flingOffset(v, tau, t);
        const offset = { x: o0.x + d.x, y: o0.y + d.y };
        const cam: Camera = { scale: s, offset, rotation: rot };
        const c = clampOffset(offset, s);
        if (Math.abs(c.x - offset.x) > 0.5 || Math.abs(c.y - offset.y) > 0.5)
          return { cam, done: true, settleTo: { scale: s, offset: c, rotation: rot } };
        return { cam, done: flingSettled(v, tau, t) };
      },
    };
    runLoop();
  }

  function localPoint(e: { clientX: number; clientY: number }): Point {
    const rect = containerRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  // Fire onMoveStart once per gesture, the first time real movement happens.
  function beginMove() {
    userAdjusted.current = true;
    lastFocus.current = null;
    setMoving(true);
    if (!moveStartFired.current) {
      moveStartFired.current = true;
      onMoveStart?.();
    }
  }

  function onPointerDown(e: React.PointerEvent) {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    onInteractStart?.();
    // 움직이는 중이면(부스로 가는 중, 미끄러지는 중) 손이 닿은 그 자리에서 잡는다.
    stopCamera();
    const p = localPoint(e);
    samples.current = [{ t: e.timeStamp, x: p.x, y: p.y }];
    pointers.current.set(e.pointerId, p);
    const pts = [...pointers.current.values()];
    const { scale, offset } = view.current;

    if (pts.length === 1) {
      moveStartFired.current = false;
      gesture.current = {
        mode: "pan",
        startOffset: offset,
        startScale: scale,
        startDist: 0,
        focalWorld: { x: 0, y: 0 },
        startPoint: p,
        moved: false,
      };
    } else if (pts.length === 2) {
      const [a, b] = pts;
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      gesture.current = {
        mode: "pinch",
        startOffset: offset,
        startScale: scale,
        startDist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
        focalWorld: {
          x: (mid.x - offset.x) / scale,
          y: (mid.y - offset.y) / scale,
        },
        startPoint: mid,
        moved: true,
      };
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!pointers.current.has(e.pointerId)) return;
    const lp = localPoint(e);
    pointers.current.set(e.pointerId, lp);
    if (pointers.current.size === 1) {
      const list = samples.current;
      list.push({ t: e.timeStamp, x: lp.x, y: lp.y });
      while (list.length > 2 && e.timeStamp - list[0].t > VELOCITY_WINDOW_MS)
        list.shift();
    }
    const g = gesture.current;
    if (!g) return;
    const pts = [...pointers.current.values()];

    if (g.mode === "pinch" && pts.length >= 2) {
      const [a, b] = pts;
      const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const next = clamp(
        (g.startScale * dist) / g.startDist,
        minScale(),
        maxScale(),
      );
      beginMove();
      view.current = {
        scale: next,
        offset: clampOffset(
          {
            x: mid.x - g.focalWorld.x * next,
            y: mid.y - g.focalWorld.y * next,
          },
          next,
        ),
      };
      applyView();
    } else if (g.mode === "pan") {
      const cur = pts[0];
      const dx = cur.x - g.startPoint.x;
      const dy = cur.y - g.startPoint.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) {
        g.moved = true;
        beginMove();
      }
      view.current = {
        scale: view.current.scale,
        offset: clampOffset(
          { x: g.startOffset.x + dx, y: g.startOffset.y + dy },
          view.current.scale,
        ),
      };
      applyView();
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    const wasPan = gesture.current?.mode === "pan";
    const moved = gesture.current?.moved;
    const p = pointers.current.get(e.pointerId) ?? localPoint(e);
    pointers.current.delete(e.pointerId);

    // Hand off to a single-finger pan if one pointer remains after a pinch.
    if (pointers.current.size === 1) {
      const [rest] = [...pointers.current.values()];
      gesture.current = {
        mode: "pan",
        startOffset: view.current.offset,
        startScale: view.current.scale,
        startDist: 0,
        focalWorld: { x: 0, y: 0 },
        startPoint: rest,
        moved: true,
      };
      samples.current = [];
      return;
    }
    if (pointers.current.size > 0) return;
    gesture.current = null;
    // A real pan/pinch just ended → let the chrome come back.
    if (moveStartFired.current) {
      moveStartFired.current = false;
      onMoveEnd?.();
    }
    if (moved) {
      settleAfterRelease(
        wasPan
          ? releaseVelocity(samples.current, e.timeStamp, VELOCITY_WINDOW_MS)
          : { x: 0, y: 0 },
      );
      samples.current = [];
      return;
    }
    samples.current = [];

    if (wasPan && !moved) {
      const now = e.timeStamp;
      const prev = lastTap.current;
      const { scale, offset } = view.current;
      const isDouble =
        now - prev.t < 300 && Math.hypot(p.x - prev.x, p.y - prev.y) < 32;
      if (isDouble) {
        // Double-tap to zoom in toward the tapped point (or out if near max).
        zoomBy(scale > 3 ? 0.55 : 1.6, p, true);
        lastTap.current = { t: 0, x: 0, y: 0 };
      } else {
        lastTap.current = { t: now, x: p.x, y: p.y };
        // Un-project the tap through pan/zoom, then un-rotate to world coords.
        const world = fromContent({
          x: (p.x - offset.x) / scale,
          y: (p.y - offset.y) / scale,
        });
        const mx = world.x;
        const my = world.y;
        // Prefer selecting the nearest booth within a finger-friendly radius.
        if (onSelect) {
          // Point-in-rect hit test against each booth's actual box.
          let hit = "";
          let hitBooth: BoothListItem | undefined;
          for (const b of booths) {
            if (floorplan && !(b.code && rectByCode.has(b.code))) continue;
            const g = geomOf(b);
            if (
              mx >= g.x - g.w / 2 &&
              mx <= g.x + g.w / 2 &&
              my >= g.y - g.h / 2 &&
              my <= g.y + g.h / 2
            ) {
              hit = b.id;
              hitBooth = b;
              break;
            }
          }
          // Tapping a booth NEVER changes zoom — keep the visitor's exact
          // current scale. Only pan so the booth sits centred: horizontally in
          // the map, vertically in the band between the top bar and the popup
          // (focusCenterY) so the tapped booth + its neighbours stay visible.
          if (hitBooth) {
            const el = containerRef.current;
            if (el) {
              const g = geomOf(hitBooth);
              const s = view.current.scale;
              // Centre on the booth's rotated screen position, not its raw x/y.
              const cp = toContent({ x: g.x, y: g.y });
              view.current = {
                scale: s,
                offset: clampOffset(
                  {
                    x: el.clientWidth / 2 - cp.x * s,
                    y: focusCenterY(el, cp.y, s),
                  },
                  s,
                ),
              };
              userAdjusted.current = true;
              lastFocus.current = null;
              applyView(true);
              persistView();
            }
          }
          onSelect(hit); // empty → caller deselects
          return;
        }
        if (onMapTap && mx >= 0 && my >= 0 && mx <= width && my <= height)
          onMapTap({ x: Math.round(mx), y: Math.round(my) });
      }
    }
    persistView(); // 드래그/핀치 놓은 최종 위치를 기억한다.
  }

  function onWheel(e: React.WheelEvent) {
    // Gentler step + dampened for trackpads (many small deltas) so wheel/pinch
    // zoom feels smooth rather than jumpy. 커서 지점이 고정점이다(그 아래 부스가 제자리에 있다).
    if (e.deltaY !== 0) {
      stopCamera();
      setMoving(true);
      const step = Math.min(0.08, Math.abs(e.deltaY) * 0.0016);
      zoomBy(e.deltaY < 0 ? 1 + step : 1 - step, localPoint(e));
      // 휠이 멈추면(map-move 길이만큼 조용하면) 합성 층을 풀어 글자를 그 배율로 다시 그린다.
      if (wheelIdle.current) clearTimeout(wheelIdle.current);
      const wait = readMotion()?.move.duration ?? 0;
      wheelIdle.current = setTimeout(() => {
        wheelIdle.current = null;
        if (!anim.current) setMoving(false);
      }, wait);
    }
  }

  // 좌표 헬퍼 타입 — 히트맵 라인(roundedPathD)에서 쓴다.
  type Pt = { x: number; y: number };

  // Build an SVG path string with rounded corners at every vertex.
  function roundedPathD(pts: Pt[], radius = 16): string {
    if (pts.length < 2) return "";
    if (pts.length === 2)
      return `M ${pts[0].x} ${pts[0].y} L ${pts[1].x} ${pts[1].y}`;
    let d = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 1; i < pts.length - 1; i++) {
      const p = pts[i];
      const a = pts[i - 1];
      const c = pts[i + 1];
      const r1 = Math.min(radius, Math.hypot(p.x - a.x, p.y - a.y) / 2);
      const r2 = Math.min(radius, Math.hypot(c.x - p.x, c.y - p.y) / 2);
      const u1 = unit(p, a);
      const u2 = unit(p, c);
      const e1 = { x: p.x + u1.x * r1, y: p.y + u1.y * r1 };
      const e2 = { x: p.x + u2.x * r2, y: p.y + u2.y * r2 };
      d += ` L ${e1.x.toFixed(1)} ${e1.y.toFixed(1)} Q ${p.x} ${p.y} ${e2.x.toFixed(1)} ${e2.y.toFixed(1)}`;
    }
    const last = pts[pts.length - 1];
    d += ` L ${last.x} ${last.y}`;
    return d;
  }

  // With a traced floorplan, route through the aisle gaps so the line never
  // crosses a booth. Otherwise fall back to the simple orthogonal path.
  // A* is expensive, so memoise on the route order (re-runs only when the plan
  // changes — not on every pan/zoom).
  // Pan to bring a chosen booth (list/search selection) into view. NEVER zooms —
  // keeps the visitor's current scale, only re-centres the booth.
  useEffect(() => {
    if (!centerOn) return;
    const b = boothById.get(centerOn);
    if (!b) return;
    const el = containerRef.current;
    if (!el) return;
    const g = geomOf(b);
    const cw = el.clientWidth;
    const next = view.current.scale;
    const cp = toContent({ x: g.x, y: g.y });
    view.current = {
      scale: next,
      offset: clampOffset(
        { x: cw / 2 - cp.x * next, y: focusCenterY(el, cp.y, next) },
        next,
      ),
    };
    userAdjusted.current = true;
    lastFocus.current = null;
    applyView(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [centerOn]);

  // Crowd heatmap geometry. The top corridors (most-walked pairs) are routed
  // through the aisles and drawn as heat lines.
  // Quantile thresholds over the non-zero counts. Tiering by rank (not by
  // count/max) keeps the four levels visible even when a few booths dwarf the
  // rest — otherwise everything but the hottest looked the same pale tint.
  const heatThresholds = useMemo(() => {
    const vals = Object.values(heat ?? {})
      .filter((v) => v > 0)
      .sort((a, b) => a - b);
    if (vals.length === 0) return null;
    const at = (p: number) =>
      vals[Math.min(vals.length - 1, Math.floor(p * vals.length))];
    return { t1: at(0.25), t2: at(0.5), t3: at(0.75) };
  }, [heat]);
  const heatLevel = (c: number): number => {
    if (!heatThresholds) return 0;
    if (c >= heatThresholds.t3) return 3;
    if (c >= heatThresholds.t2) return 2;
    if (c >= heatThresholds.t1) return 1;
    return 0;
  };
  const heatCorridors = useMemo(() => {
    if (!heatPairs?.length) return [];
    const top = [...heatPairs].sort((a, b) => b.count - a.count).slice(0, 24);
    const maxPair = Math.max(1, ...top.map((p) => p.count));
    const rects = floorplan
      ? floorplan.booths.map((b) => ({ x: b.x, y: b.y, w: b.w, h: b.h }))
      : [];
    return top
      .map((p) => {
        const a = boothById.get(p.from);
        const b = boothById.get(p.to);
        if (!a || !b) return null;
        const ga = geomOf(a);
        const gb = geomOf(b);
        const stops = [
          { x: ga.x, y: ga.y },
          { x: gb.x, y: gb.y },
        ];
        const pts = floorplan
          ? aisleRoute(stops, rects, width, height, floorplan.interior)
          : stops;
        return { d: roundedPathD(pts, 10), t: p.count / maxPair };
      })
      .filter((c): c is { d: string; t: number } => Boolean(c && c.d));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heatPairs, floorplan, width, height]);

  // 그림 층은 그 입력이 바뀔 때만 다시 만든다. 카메라는 transform 하나로만 움직이고(리렌더 없음),
  // 화면 쪽 상태(홀 버튼, 검색어 등)로 엔진이 다시 그려져도 같은 요소를 돌려줘 부스 층은 그대로 둔다.
  const layerCtx = useMemo<MapLayerContext>(
    () => ({
      width,
      height,
      booths,
      floorplan,
      geomOf: layerGeomOf,
      hallRegions,
      upright,
      selectedId,
      fitScale,
    }),
    [width, height, booths, floorplan, layerGeomOf, hallRegions, upright, selectedId, fitScale],
  );
  const layer = useMemo(
    () => (renderLayer ? renderLayer(layerCtx) : undefined),
    [renderLayer, layerCtx],
  );

  return (
    <div
      className={cn(
        "relative h-full w-full touch-none overflow-hidden bg-secondary/40",
        className,
      )}
    >
      <div
        ref={containerRef}
        className={cn(
          // touch-none: 확대·스크롤을 브라우저가 가로채지 못하게 한다(위 useEffect 참조).
          "absolute cursor-grab touch-none active:cursor-grabbing",
          viewportClassName,
        )}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={(e) => {
          pointers.current.delete(e.pointerId);
          if (pointers.current.size === 0) {
            gesture.current = null;
            samples.current = [];
            setMoving(false);
          }
        }}
        onWheel={onWheel}
        role="application"
        aria-label="행사장 지도"
      >
        <svg
          ref={svgRef}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          // Transform is applied imperatively (see applyView) so panning never
          // re-renders this subtree — only transformOrigin is React-managed.
          // will-change는 움직이는 동안만 엔진이 켠다(setMoving) — 늘 켜 두면 확대 뒤 글자가 흐리다.
          style={{ transformOrigin: "0 0" }}
          className="select-none"
        >
          {layer !== undefined ? (
            layer
          ) : (
            <>
              {/* grid backdrop. No SVG filters — drop-shadow filters force costly
              re-rasterisation on every zoom and were the main pan/zoom lag. */}
              <defs>
                <pattern
                  id="grid"
                  width="50"
                  height="50"
                  patternUnits="userSpaceOnUse"
                >
                  <path
                    d="M50 0H0V50"
                    fill="none"
                    stroke="var(--border)"
                    strokeWidth="1"
                    opacity="0.5"
                  />
                </pattern>
              </defs>
              <rect
                x="0"
                y="0"
                width={width}
                height={height}
                fill="url(#grid)"
                rx="16"
              />

              {/* Hall floor plates — each hall is one clean raised room (the venue is
              genuinely two halls). Booths sit on these; the gridded ground shows
              around them. The route's wall-containment is handled in routing, not
              drawn, so the background stays uncluttered. */}
              {hallRegions.map((r) => (
                <g key={r.label}>
                  <rect
                    x={r.x}
                    y={r.y}
                    width={r.w}
                    height={r.h}
                    rx="24"
                    fill="var(--card)"
                    stroke="var(--border)"
                    strokeWidth={2}
                  />
                  <text
                    x={r.x + 22}
                    y={r.y + 34}
                    fontSize="22"
                    fontWeight="800"
                    fill="var(--muted-foreground)"
                    opacity={0.55}
                    transform={upright(r.x + 22, r.y + 34)}
                  >
                    {r.label}
                  </text>
                </g>
              ))}

              {floorplan?.backdrop && (
                <image
                  href={floorplan.backdrop.src}
                  x={0}
                  y={0}
                  width={width}
                  height={height}
                  opacity={floorplan.backdrop.opacity ?? 0.55}
                  preserveAspectRatio="none"
                />
              )}

              {/* crowd heat: busy corridors (drawn under booths, in the aisles) */}
              {heatCorridors.map((c, i) => (
                <path
                  key={`heat-${i}`}
                  d={c.d}
                  fill="none"
                  stroke="var(--heatmap-fill-busy)"
                  strokeWidth={6 + c.t * 18}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity={0.12 + c.t * 0.33}
                />
              ))}

              {/* floorplan decor (passage arrows, info bars, entrance, labels) */}
              {floorplan?.decor.map((d, i) => {
                if (d.type === "header") {
                  return (
                    <g
                      key={i}
                      transform={upright(d.x + d.w / 2, d.y + d.h / 2)}
                    >
                      <rect
                        x={d.x}
                        y={d.y}
                        width={d.w}
                        height={d.h}
                        rx={4}
                        fill="var(--floorplan-header)"
                      />
                      <text
                        x={d.x + d.w / 2}
                        y={d.y + d.h / 2 + d.h * 0.2}
                        textAnchor="middle"
                        fontSize={d.h * 0.52}
                        fontWeight="800"
                        fill="white"
                      >
                        {d.text}
                      </text>
                    </g>
                  );
                }
                if (d.type === "info") {
                  return (
                    <g key={i} transform={upright(d.x, d.y)}>
                      <rect
                        x={d.x - 70}
                        y={d.y - 26}
                        width={140}
                        height={52}
                        rx={26}
                        fill="var(--floorplan-entrance)"
                      />
                      <text
                        x={d.x}
                        y={d.y + 11}
                        textAnchor="middle"
                        fontSize={30}
                        fontWeight="800"
                        fill="white"
                      >
                        {d.text}
                      </text>
                    </g>
                  );
                }
                if (d.type === "wc") {
                  // Restroom marker — 남/녀 pictogram (man + divider + woman), like
                  // the universal sign. Compact (smaller than a booth) and on-brand:
                  // a light card chip with primary-coloured figures.
                  const R = 16; // half box size — small, sits in the wall margin
                  const man = d.x - 7;
                  const woman = d.x + 7;
                  const headY = d.y - 8;
                  const hr = 2.9;
                  return (
                    <g key={i} transform={upright(d.x, d.y)}>
                      <rect
                        x={d.x - R}
                        y={d.y - R}
                        width={R * 2}
                        height={R * 2}
                        rx={8}
                        fill="var(--card)"
                        stroke="var(--border)"
                        strokeWidth={1.4}
                      />
                      <g fill="var(--primary)">
                        {/* man: head + downward (broad-shoulder) torso */}
                        <circle cx={man} cy={headY} r={hr} />
                        <path
                          d={`M${man - 4.5} ${headY + 3.4} L${man + 4.5} ${headY + 3.4} L${man} ${headY + 12} Z`}
                        />
                        {/* divider */}
                        <rect
                          x={d.x - 0.8}
                          y={headY - hr}
                          width={1.6}
                          height={16}
                          rx={0.8}
                        />
                        {/* woman: head + upward (dress) torso */}
                        <circle cx={woman} cy={headY} r={hr} />
                        <path
                          d={`M${woman} ${headY + 3.4} L${woman - 4.5} ${headY + 12} L${woman + 4.5} ${headY + 12} Z`}
                        />
                      </g>
                    </g>
                  );
                }
                if (d.type === "arrowsV") {
                  const cx = d.x;
                  const sz = d.size ?? 1;
                  const hw = 16 * sz; // 화살촉 반너비
                  const hh = 14 * sz; // 화살촉 높이
                  return (
                    <g
                      key={i}
                      stroke="var(--muted-foreground)"
                      strokeWidth={5 * sz}
                      strokeLinecap="round"
                      opacity={0.7}
                      fill="none"
                    >
                      <line
                        x1={cx}
                        y1={d.y1}
                        x2={cx}
                        y2={d.y2}
                        strokeDasharray={`${6 * sz} ${14 * sz}`}
                      />
                      <path
                        d={`M${cx - hw} ${d.y1 + hh} L${cx} ${d.y1} L${cx + hw} ${d.y1 + hh}`}
                      />
                      <path
                        d={`M${cx - hw} ${d.y2 - hh} L${cx} ${d.y2} L${cx + hw} ${d.y2 - hh}`}
                      />
                    </g>
                  );
                }
                if (d.type === "entrance") {
                  const sz = d.size ?? 1;
                  const aw = 22 * sz;
                  const hw = 112 * sz; // half pill width (fits "B1홀 입구")
                  const armLen = 44 * sz;
                  const arrow =
                    d.dir === "left"
                      ? `M${d.x + hw} ${d.y - aw} L${d.x + hw + aw} ${d.y} L${d.x + hw} ${d.y + aw}`
                      : d.dir === "right"
                        ? `M${d.x - hw} ${d.y - aw} L${d.x - hw - aw} ${d.y} L${d.x - hw} ${d.y + aw}`
                        : d.dir === "up"
                          ? `M${d.x - aw} ${d.y + armLen} L${d.x} ${d.y + armLen - aw} L${d.x + aw} ${d.y + armLen}`
                          : `M${d.x - aw} ${d.y + armLen} L${d.x} ${d.y + armLen + aw} L${d.x + aw} ${d.y + armLen}`;
                  // Single theme colour — 입구/출구 are told apart by their label
                  // ("A홀 입구" / "B1홀 출구") and arrow direction, not by colour.
                  const color = "var(--primary)";
                  return (
                    <g key={i} transform={upright(d.x, d.y)}>
                      <rect
                        x={d.x - hw}
                        y={d.y - 28 * sz}
                        width={hw * 2}
                        height={56 * sz}
                        rx={28 * sz}
                        fill={color}
                      />
                      <text
                        x={d.x}
                        y={d.y + 9 * sz}
                        textAnchor="middle"
                        fontSize={26 * sz}
                        fontWeight="800"
                        fill="white"
                      >
                        {d.text}
                      </text>
                      <path
                        d={arrow}
                        fill="none"
                        stroke={color}
                        strokeWidth={9 * sz}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </g>
                  );
                }
                // label
                return (
                  <text
                    key={i}
                    x={d.x}
                    y={d.y}
                    textAnchor={d.anchor ?? "start"}
                    fontSize={d.size ?? 14}
                    fontWeight="700"
                    fill="var(--muted-foreground)"
                    transform={upright(d.x, d.y)}
                  >
                    {d.text}
                  </text>
                );
              })}

              {/* passage connecting the two halls + entrance marker (auto, non-floorplan) */}
              {!floorplan &&
                hallRegions.length === 2 &&
                (() => {
                  const [top, bot] = [...hallRegions].sort((a, b) => a.y - b.y);
                  const x1 = Math.max(top.x, bot.x);
                  const x2 = Math.min(top.x + top.w, bot.x + bot.w);
                  if (x2 <= x1) return null;
                  const cx = (x1 + x2) / 2;
                  const yTop = top.y + top.h;
                  const yBot = bot.y;
                  const my = (yTop + yBot) / 2;
                  return (
                    <g>
                      <line
                        x1={cx}
                        y1={yTop - 4}
                        x2={cx}
                        y2={yBot + 4}
                        stroke="var(--muted-foreground)"
                        strokeWidth={2}
                        strokeDasharray="2 6"
                        opacity={0.5}
                      />
                      {[yTop, yBot].map((cy, i) => (
                        <path
                          key={i}
                          d={
                            i === 0
                              ? `M${cx - 7} ${cy - 6} L${cx} ${cy - 12} L${cx + 7} ${cy - 6}`
                              : `M${cx - 7} ${cy + 6} L${cx} ${cy + 12} L${cx + 7} ${cy + 6}`
                          }
                          fill="none"
                          stroke="var(--muted-foreground)"
                          strokeWidth={2}
                          strokeLinecap="round"
                          opacity={0.6}
                        />
                      ))}
                      <rect
                        x={cx - 26}
                        y={my - 9}
                        width={52}
                        height={18}
                        rx={9}
                        fill="var(--floorplan-entrance)"
                      />
                      <text
                        x={cx}
                        y={my + 4}
                        textAnchor="middle"
                        fontSize="11"
                        fontWeight="800"
                        fill="white"
                      >
                        안내
                      </text>
                      {/* entrance pill on the right edge of the top hall */}
                      <rect
                        x={top.x + top.w - 6}
                        y={top.y + top.h / 2 - 26}
                        width={14}
                        height={52}
                        rx={4}
                        fill="var(--primary)"
                        opacity={0.85}
                      />
                    </g>
                  );
                })()}

              {/* booths */}
              {renderBooths.map((b) => {
                // With a floorplan, only render booths that have traced geometry
                // (avoids a stray fallback box overlapping the plan). Exception:
                // a SELECTED booth without geometry (책마을 B4xx 등 좌표 미트레이스)
                // draws a fallback box at its zone-center coords so "누르면 위치 표시"
                // 동작이 된다.
                if (
                  floorplan &&
                  !(b.code && rectByCode.has(b.code)) &&
                  b.id !== selectedId
                )
                  return null;
                const cat = catById.get(b.categoryId);
                const isSel = b.id === selectedId;
                // verdict가 있으면 interest는 안 본다 — 결과가 예측을 덮는다
                // (judgment-vocabulary §4-2: 색 = verdict ?? interest ?? 존 색).
                const isGood = goodSet.has(b.id);
                const isOk = !isGood && okSet.has(b.id);
                const isBad = !isGood && !isOk && badSet.has(b.id);
                const hasVerdict = isGood || isOk || isBad;
                const isMust = !hasVerdict && mustSet.has(b.id);
                const isCurious =
                  !hasVerdict && !isMust && curiousSet.has(b.id);
                const isPass =
                  !hasVerdict && !isMust && !isCurious && passSet.has(b.id);
                const g = geomOf(b);
                return (
                  <g
                    key={b.id}
                    transform={`translate(${g.x} ${g.y})${g.rotate ? ` rotate(${g.rotate})` : ""}`}
                    className="cursor-pointer"
                    role="button"
                    aria-label={`${b.name}${b.code ? ` (${b.code})` : ""}`}
                  >
                    {(() => {
                      const color = cat?.color ?? "var(--primary)";
                      const zone = g.color ?? `${color}26`;
                      // Map uses STATE colors only — 전부 면(fill), 테두리·뱃지로 상태를
                      // 나르지 않는다. Category hue는 칩·상세에만.
                      const fill = isGood
                        ? "var(--judge-good)"
                        : isOk
                          ? "var(--judge-ok)"
                          : isBad
                            ? "var(--judge-bad)"
                            : isMust
                              ? "var(--judge-must)"
                              : isCurious
                                ? "var(--judge-curious)"
                                : isPass
                                  ? "var(--judge-pass)"
                                  : zone;
                      // 진한 색(꼭 갈래·아니었어)은 어두워 흰 글씨, 옅은 색은 어두운
                      // 글씨 — 6색 전부 면이라 색마다 대비를 직접 확인해야 한다. --judge-good
                      // (--route-visited 재사용, 중간 밝기 초록)은 흰 글씨 대비가 부족해서
                      // (~2.2:1, 필요한 4.5:1에 한참 못 미침) 뺐다 — 어두운 글씨 쪽으로 떨어진다
                      // (judgment-vocabulary 최종 리뷰 Fix 10). 변수명은 lightText — "이 면엔
                      // 밝은(흰) 글씨가 필요하다"는 뜻이다(과거 darkText는 뜻이 반대로 읽혔다).
                      //
                      // 예전엔 `|| fill === "#3a3d44"` 가 붙어 있었는데 **걸릴 수 없는
                      // 조건이었다**: fill 은 judge 토큰 아니면 zone 이고, zone 은 도면
                      // 데이터의 색이거나 `색+"26"` 이다. 그 hex 를 쓰는 도면 데이터는
                      // 0건이고 알파를 붙인 쪽은 애초에 문자열이 다르다. 토큰으로 옮기면
                      // `fill === "var(--booth-label)"` 가 되는데, 데이터에서 온 hex 가
                      // 그 문자열일 수는 없으니 더 확실히 죽는다 — 그래서 지웠다.
                      const lightText = isMust || isBad;
                      const stroke = isSel
                        ? "var(--primary)"
                        : isGood
                          ? "var(--judge-good)"
                          : isOk
                            ? "var(--judge-ok)"
                            : isBad
                              ? "var(--judge-bad)"
                              : isMust
                                ? "var(--judge-must)"
                                : isCurious
                                  ? "var(--judge-curious)"
                                  : isPass
                                    ? "var(--judge-pass)"
                                    : g.color && g.color !== FLOORPLAN_NO_COLOR
                                      ? g.color
                                      : "var(--border)";
                      const codeColor = lightText
                        ? "white"
                        : "var(--booth-label)";
                      const name =
                        b.name.length > 9 ? `${b.name.slice(0, 9)}…` : b.name;
                      return (
                        <>
                          {/* Draw the box inset by a few px so neighbouring booths
                          keep a visible gap (aisle) between them, like the
                          official map — booth coords pack edge-to-edge. */}
                          <rect
                            x={-g.w / 2 + BOOTH_GAP}
                            y={-g.h / 2 + BOOTH_GAP}
                            width={Math.max(8, g.w - BOOTH_GAP * 2)}
                            height={Math.max(8, g.h - BOOTH_GAP * 2)}
                            rx={5}
                            fill={fill}
                            stroke={stroke}
                            strokeWidth={isSel ? 3.5 : 1.2}
                          />
                          {(() => {
                            // 모든 부스에 코드 + 이름을 함께 표시한다. 글자 크기는
                            // 부스 크기에 비례(작은 부스 작게, 큰 부스 크게). 이름은
                            // **어절 단위로** 줄을 바꾸고(`layoutBoothLabel`), 어절이
                            // 한 줄에 안 들어갈 때만 글자를 절반까지 줄인다.
                            // 규칙 값은 토큰 ratio.map-booth-name*(booth-label.ts).
                            const base = labelBaseUnits(g.w, g.h);
                            const inner = labelInner(g.w, g.h);
                            // 한글 글자폭 ≈ 1em. 옆으로 넘치지 않게 일부만 쓴다(NAME_WIDTH).
                            const label = layoutBoothLabel(
                              b.name,
                              base,
                              inner.w * NAME_WIDTH,
                              inner.h,
                              Boolean(b.code),
                            );
                            const lines = label.lines;
                            const fs = label.fontSize;
                            const codeFs = fs * CODE_RATIO;
                            const codeLH = b.code
                              ? codeFs * CODE_LINE_HEIGHT
                              : 0;
                            const nameLH = fs * NAME_LINE_HEIGHT;
                            // 코드 + 이름 블록을 세로 중앙 정렬(central 베이스라인).
                            const blockH = codeLH + lines.length * nameLH;
                            let cy = -blockH / 2;
                            const rows: {
                              t: string;
                              y: number;
                              size: number;
                              code?: boolean;
                            }[] = [];
                            if (b.code) {
                              rows.push({
                                t: b.code,
                                y: cy + codeLH / 2,
                                size: codeFs,
                                code: true,
                              });
                              cy += codeLH;
                            }
                            for (const ln of lines) {
                              rows.push({
                                t: ln,
                                y: cy + nameLH / 2,
                                size: fs,
                              });
                              cy += nameLH;
                            }
                            return (
                              <text
                                textAnchor="middle"
                                dominantBaseline="central"
                                fontWeight="800"
                                fill={codeColor}
                                transform={upright(0, 0)}
                              >
                                {rows.map((r, ri) => (
                                  <tspan
                                    key={ri}
                                    x={0}
                                    y={r.y}
                                    fontSize={r.size}
                                    fontWeight={r.code ? 600 : 800}
                                    fillOpacity={r.code ? 0.72 : 1}
                                  >
                                    {r.t}
                                  </tspan>
                                ))}
                              </text>
                            );
                          })()}
                          {/* 끌림 부스는 색만으론 기본 줌에서 잘 안 보인다 — 우상단에
                          작은 점 마커를 얹어 라벨을 읽지 않아도 눈에 띄게. 색맹 대비
                          형태 단서(색 의존 회피). */}
                          {isCurious && !isSel && (
                            <circle
                              cx={g.w / 2 - BOOTH_GAP - 3}
                              cy={-g.h / 2 + BOOTH_GAP + 3}
                              r={clamp(Math.min(g.w, g.h) / 9, 3, 6)}
                              fill="var(--warning)"
                              stroke="white"
                              strokeWidth={1.2}
                            />
                          )}
                          {isSel && (
                            <text
                              textAnchor="middle"
                              y={-g.h / 2 - 6}
                              fontSize="13"
                              fontWeight="700"
                              fill="var(--foreground)"
                              transform={upright(0, -g.h / 2 - 6)}
                            >
                              {name}
                            </text>
                          )}
                        </>
                      );
                    })()}
                  </g>
                );
              })}

              {/* crowd heat: popular booths tinted on top so the hot spots pop */}
              {heat &&
                renderBooths.map((b) => {
                  const c = heat[b.id];
                  if (!c) return null;
                  if (floorplan && !(b.code && rectByCode.has(b.code)))
                    return null;
                  const g = geomOf(b);
                  const tier = HEAT_TIERS[heatLevel(c)];
                  return (
                    <rect
                      key={`bh-${b.id}`}
                      x={g.x - g.w / 2}
                      y={g.y - g.h / 2}
                      width={g.w}
                      height={g.h}
                      rx={6}
                      fill={tier.fill}
                      opacity={tier.opacity}
                      style={{ mixBlendMode: "multiply" }}
                      pointerEvents="none"
                    />
                  );
                })}

              {/* visitor position */}
              {position && (
                <g transform={`translate(${position.x} ${position.y})`}>
                  <circle r="22" fill="var(--primary)" opacity="0.18">
                    <animate
                      attributeName="r"
                      values="14;26;14"
                      dur="2s"
                      repeatCount="indefinite"
                    />
                  </circle>
                  <circle
                    r="9"
                    fill="var(--primary)"
                    stroke="white"
                    strokeWidth="3"
                  />
                </g>
              )}
            </>
          )}
        </svg>
      </div>

      {/* controls */}
      {!hideControls && (
        <div
          className={cn("absolute z-10 flex flex-col gap-2", controlsClassName)}
        >
          <Button
            variant="outline"
            size="icon"
            className="bg-card shadow-[var(--shadow-card)]"
            aria-label="지도 90도 회전"
            onClick={() => {
              trackClick("map_rotate");
              rotate90();
            }}
          >
            <RotateCw className="size-5" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="bg-card shadow-[var(--shadow-card)]"
            aria-label="확대"
            onClick={() => {
              trackClick("map_zoom_in");
              zoomBy(1.25, undefined, true);
            }}
          >
            <Plus className="size-5" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="bg-card shadow-[var(--shadow-card)]"
            aria-label="축소"
            onClick={() => {
              trackClick("map_zoom_out");
              zoomBy(0.8, undefined, true);
            }}
          >
            <Minus className="size-5" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="bg-card shadow-[var(--shadow-card)]"
            aria-label="전체 보기"
            onClick={() => {
              trackClick("map_reset_view");
              resetView();
            }}
          >
            <Maximize2 className="size-5" />
          </Button>
        </div>
      )}
    </div>
  );
}
