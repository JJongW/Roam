/**
 * 지도 카메라(배율, 위치, 회전)를 한 루프에서 움직이는 데 쓰는 순수 계산.
 *
 * 엔진(`exhibition-map.tsx`)은 이동 요청을 requestAnimationFrame 루프 하나에서 보간한다.
 * 예전엔 모든 이동이 CSS `transition: transform 220ms ease-out` 하나였고, 진행 중에 새
 * 요청이 오면 전환이 겹치고, 손을 떼면 그 자리에서 멈췄다(2026-11-21 메가주 분석).
 *
 * 길이와 곡선은 Roam-design v2 모션 토큰에서 받는다(`--roam-v2-motion-map-move-*`,
 * `--roam-v2-motion-map-level-*`, `--roam-v2-easing-enter`). 여기엔 그 값을 적지 않는다.
 */
import type { CSSProperties } from "react";

export interface Point {
  x: number;
  y: number;
}

/** 화면 px = offset + scale × (회전한 도면 좌표). 회전은 도면 가운데를 축으로 돈다. */
export interface Camera {
  scale: number;
  offset: Point;
  rotation: number;
}

export type Easing = (t: number) => number;
export type Bezier = [number, number, number, number];

/** CSS `cubic-bezier(x1, y1, x2, y2)` 문자열을 제어점 4개로. 못 읽으면 null. */
export function parseCubicBezier(value: string | null | undefined): Bezier | null {
  const m = value
    ?.trim()
    .match(/^cubic-bezier\(\s*([^,]+),\s*([^,]+),\s*([^,]+),\s*([^)]+)\)$/);
  if (!m) return null;
  const n = m.slice(1, 5).map(Number);
  return n.every(Number.isFinite) ? (n as Bezier) : null;
}

/** CSS 시간(`300ms`, `0.3s`)을 ms로. 못 읽으면 null. */
export function parseDurationMs(value: string | null | undefined): number | null {
  const m = value?.trim().match(/^(-?\d*\.?\d+)(ms|s)$/);
  if (!m) return null;
  const n = Number(m[1]) * (m[2] === "s" ? 1000 : 1);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** CSS cubic-bezier와 같은 곡선. x(시간)에 대한 y(진행도)를 뉴턴법 + 이분법으로 푼다. */
export function cubicBezier([x1, y1, x2, y2]: Bezier): Easing {
  const ax = 3 * x1 - 3 * x2 + 1;
  const bx = 3 * x2 - 6 * x1;
  const cx = 3 * x1;
  const ay = 3 * y1 - 3 * y2 + 1;
  const by = 3 * y2 - 6 * y1;
  const cy = 3 * y1;
  const sx = (u: number) => ((ax * u + bx) * u + cx) * u;
  const sy = (u: number) => ((ay * u + by) * u + cy) * u;
  const dx = (u: number) => (3 * ax * u + 2 * bx) * u + cx;
  const solve = (x: number) => {
    let u = x;
    for (let i = 0; i < 8; i++) {
      const err = sx(u) - x;
      if (Math.abs(err) < 1e-6) return u;
      const d = dx(u);
      if (Math.abs(d) < 1e-6) break;
      u -= err / d;
    }
    let lo = 0;
    let hi = 1;
    u = x;
    for (let i = 0; i < 30; i++) {
      const v = sx(u);
      if (Math.abs(v - x) < 1e-6) break;
      if (v < x) lo = u;
      else hi = u;
      u = (lo + hi) / 2;
    }
    return u;
  };
  return (t) => (t <= 0 ? 0 : t >= 1 ? 1 : sy(solve(t)));
}

/**
 * 두 카메라 사이를 진행도 e(0~1)로 잇는다. 배율과 위치를 **같은 진행도**로 묶는다.
 *
 * 배율은 곱셈으로(log 공간에서 고르게) 바꾸고, 위치는 두 카메라가 공유하는 고정점(배율이
 * 바뀌어도 화면 자리가 그대로인 점)을 축으로 맞춘다. 그러면 화면 위 모든 점이 시작 자리에서
 * 끝 자리로 **곧은 선**을 따라가고, 확대가 가까울수록 빨라 보이는 일도 없다. 배율이 거의
 * 같으면(이동만) 위치를 곧게 보간한다.
 */
export function interpolateCamera(from: Camera, to: Camera, e: number): Camera {
  if (e <= 0) return from;
  if (e >= 1) return to;
  const s0 = from.scale;
  const s1 = to.scale;
  const rotation = from.rotation + (to.rotation - from.rotation) * e;
  if (!(s0 > 0) || !(s1 > 0) || Math.abs(s1 - s0) < s0 * 1e-6) {
    return {
      scale: s0 + (s1 - s0) * e,
      offset: {
        x: from.offset.x + (to.offset.x - from.offset.x) * e,
        y: from.offset.y + (to.offset.y - from.offset.y) * e,
      },
      rotation,
    };
  }
  const scale = s0 * Math.pow(s1 / s0, e);
  // offset(s)는 고정점 축 확대에서 s에 대해 일차다: o = o0 + (o1 − o0)·(s − s0)/(s1 − s0).
  const k = (scale - s0) / (s1 - s0);
  return {
    scale,
    offset: {
      x: from.offset.x + (to.offset.x - from.offset.x) * k,
      y: from.offset.y + (to.offset.y - from.offset.y) * k,
    },
    rotation,
  };
}

/** 같은 카메라인지(화면에서 0.01px 안쪽). */
export function sameCamera(a: Camera, b: Camera): boolean {
  return (
    Math.abs(a.scale - b.scale) < 1e-6 &&
    Math.abs(a.offset.x - b.offset.x) < 0.01 &&
    Math.abs(a.offset.y - b.offset.y) < 0.01 &&
    Math.abs(a.rotation - b.rotation) < 1e-6
  );
}

/** 포인터 표본(시각 ms, 화면 px). */
export interface Sample {
  t: number;
  x: number;
  y: number;
}

/**
 * 손 뗀 순간의 속도(px/ms). 마지막 표본에서 `windowMs` 안쪽의 표본만 본다 — 끌다가 멈춘 뒤
 * 놓으면(마지막 표본이 오래됐으면) 0이다. `windowMs`는 디자인 값이 아니라 입력 거르기 폭이다.
 */
export function releaseVelocity(samples: Sample[], now: number, windowMs: number): Point {
  if (samples.length < 2) return { x: 0, y: 0 };
  const last = samples[samples.length - 1];
  if (now - last.t > windowMs) return { x: 0, y: 0 };
  let first = last;
  for (let i = samples.length - 2; i >= 0; i--) {
    if (last.t - samples[i].t > windowMs) break;
    first = samples[i];
  }
  const dt = last.t - first.t;
  if (dt <= 0) return { x: 0, y: 0 };
  return { x: (last.x - first.x) / dt, y: (last.y - first.y) / dt };
}

/**
 * 손으로 튕긴 뒤 감속(`decay.map-fling`, 2026-11-21 Ted B안). 속도가 v(t) = v0·e^(−t/τ)로 줄어
 * 위치는 x(t) = v0·τ·(1 − e^(−t/τ)), 끝까지 가면 v0·τ만큼 간다. τ는 `--roam-v2-decay-map-fling-tau`.
 * 길이가 속도에 따라 달라지므로 map-move(300ms)와 묶지 않는다.
 */
export function flingOffset(v0: Point, tauMs: number, t: number): Point {
  if (!(tauMs > 0) || t <= 0) return { x: 0, y: 0 };
  const k = tauMs * (1 - Math.exp(-t / tauMs));
  return { x: v0.x * k, y: v0.y * k };
}

/** 튕긴 뒤 끝까지 가는 거리(v0·τ). */
export function flingDistance(v0: Point, tauMs: number): Point {
  if (!(tauMs > 0)) return { x: 0, y: 0 };
  return { x: v0.x * tauMs, y: v0.y * tauMs };
}

/** 남은 거리(|v0|·τ·e^(−t/τ))가 `epsPx`보다 작으면 멈춘 것으로 본다. `epsPx`는 화면 반올림 폭이지 디자인 값이 아니다. */
export function flingSettled(v0: Point, tauMs: number, t: number, epsPx = 0.5): boolean {
  if (!(tauMs > 0)) return true;
  return Math.hypot(v0.x, v0.y) * tauMs * Math.exp(-t / tauMs) < epsPx;
}

/** 라벨 단계: 한 옥타브(배율 2배)를 몇 단계로 나눌지. 단계가 바뀔 때만 스타일을 다시 계산한다. */
export const LABEL_LEVELS_PER_OCTAVE = 4;

/** 지금 배율의 라벨 단계. */
export function zoomLevel(scale: number): number {
  return Math.floor(LABEL_LEVELS_PER_OCTAVE * Math.log2(Math.max(scale, 1e-6)));
}

/** 글자(도면 단위 `fontSize`)가 화면에서 `minPx` 이상으로 보이기 시작하는 단계. */
export function labelLevel(fontSize: number, minPx: number): number {
  return Math.ceil(LABEL_LEVELS_PER_OCTAVE * Math.log2(minPx / Math.max(fontSize, 1e-6)));
}

/**
 * 칸(도면 단위 `w`×`h`)이 화면에서 `minW`×`minH` px 이상으로 보이기 시작하는 단계. 단계가 이 값 이상이면
 * 배율이 2^(단계/4) 이상이라 칸이 그 크기 이상이다. 단계는 내림이라 실제 문턱보다 최대 한 단계 늦다.
 */
export function sizeLevel(w: number, h: number, minW: number, minH: number): number {
  const need = Math.max(minW / Math.max(w, 1e-6), minH / Math.max(h, 1e-6));
  return Math.ceil(LABEL_LEVELS_PER_OCTAVE * Math.log2(need));
}

/** 단계 `level`의 배율 하한(2^(단계/4)). */
export function levelScale(level: number): number {
  return 2 ** (level / LABEL_LEVELS_PER_OCTAVE);
}

/** 엔진이 지금 라벨 단계를 적는 CSS 변수. 디자인 값이 아니라 엔진 상태다. */
export const ZOOM_LEVEL_VAR = "--map-zoom-level";

/**
 * 라벨을 단계에 따라 보이고 숨긴다. 엔진이 SVG에 단계(`ZOOM_LEVEL_VAR`)를 적으면 단계가
 * `level` 이상인 동안 보이고(1), 아래면 숨는다(0). 사이는 map-level 토큰 길이와 곡선으로 잇는다.
 * 단계를 아직 안 적었으면(첫 그림 전) 변수가 없어 opacity가 기본값(보임)으로 떨어진다.
 * `base`는 보일 때의 투명도(번호 줄의 map-code 토큰 등).
 */
export function labelFadeStyle(
  level: number,
  base = 1,
  opts: { below?: boolean; fallback?: number } = {},
): CSSProperties {
  // `below`: 거꾸로, 단계가 `level` 아래인 동안 보이고 이상이면 숨는다(작은 칸 모양 ↔ 큰 칸 모양 바꿔 끼우기).
  // `fallback`: 단계를 아직 안 적었을 때 쓸 단계. 없으면 위 설명대로 보임으로 떨어진다.
  const v = zoomVar(opts.fallback);
  const on = opts.below
    ? `clamp(0, calc(${level} - ${v}), 1)`
    : `clamp(0, calc(${v} - ${level - 1}), 1)`;
  return {
    opacity: base === 1 ? on : `calc(${base} * ${on})`,
    transition: LEVEL_TRANSITION,
  };
}

/** 단계가 [from, to) 안인 동안만 보인다. 끝이 무한이면 그쪽은 열려 있다. */
export function levelBandStyle(from: number, to: number, fallback?: number): CSSProperties {
  const v = zoomVar(fallback);
  const parts = [
    Number.isFinite(from) ? `calc(${v} - ${from - 1})` : null,
    Number.isFinite(to) ? `calc(${to} - ${v})` : null,
  ].filter(Boolean);
  if (parts.length === 0) return {};
  const on = parts.length === 1 ? parts[0] : `min(${parts.join(", ")})`;
  return { opacity: `clamp(0, ${on}, 1)`, transition: LEVEL_TRANSITION };
}

/** CSS에서 지금 단계(화면 1px당 도면 단위를 셀 때 쓰는 값). */
export function zoomVar(fallback?: number): string {
  return fallback === undefined ? `var(${ZOOM_LEVEL_VAR})` : `var(${ZOOM_LEVEL_VAR}, ${fallback})`;
}

const LEVEL_TRANSITION =
  "opacity var(--roam-v2-motion-map-level-duration) var(--roam-v2-motion-map-level-easing)";

/** 토큰에서 읽은 지도 모션. 못 읽으면 duration이 0(즉시)이다. */
export interface MapMotion {
  /** map-move: 프로그램 이동(부스로 가기, 홀 바꾸기, 전체 보기, 확대 버튼). */
  move: { duration: number; curve: Bezier | null };
  /** 경계 밖에서 안으로 정착. spring.settle의 웹 근사가 미정이라 enter 곡선을 map-move 길이로 대신한다. */
  settle: { duration: number; curve: Bezier | null };
  /** 손으로 튕긴 뒤 감속의 τ(ms). 동작 줄이기면 0(관성 없음). */
  flingTau: number;
}

/** 요소의 계산된 스타일에서 지도 모션 토큰을 읽는다. 동작 줄이기면 map-move는 즉시(토큰 reduceMotion),
 *  튕긴 뒤 관성은 없다(그 자리에 멈춘다, decay.map-fling 결정). */
export function readMapMotion(el: Element, reduceMotion: boolean): MapMotion {
  const cs = getComputedStyle(el);
  const get = (name: string) => cs.getPropertyValue(name);
  const duration = reduceMotion
    ? 0
    : (parseDurationMs(get("--roam-v2-motion-map-move-duration")) ?? 0);
  return {
    move: {
      duration,
      curve: parseCubicBezier(get("--roam-v2-motion-map-move-easing")),
    },
    settle: {
      duration,
      curve: parseCubicBezier(get("--roam-v2-easing-enter")),
    },
    flingTau: reduceMotion
      ? 0
      : (parseDurationMs(get("--roam-v2-decay-map-fling-tau")) ?? 0),
  };
}
