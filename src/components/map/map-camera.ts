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

/**
 * 화면 px = offset + scale × 내용 좌표. 내용 좌표는 도면을 가운데 축으로 `rotation`도 돌린 뒤, 돌린 도면을
 * 감싸는 축 정렬 상자(`footprint`)의 왼쪽 위가 0이 되게 옮긴 좌표다(`toContent`). 0도면 도면 좌표 그대로다.
 * 그래서 맞추기와 가두기는 각도와 상관없이 "0~fw × 0~fh 상자" 하나로 계산한다.
 */
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
export function interpolateCamera(
  from: Camera,
  to: Camera,
  e: number,
  /** 각도가 다른 두 카메라를 이을 때 쓴다. 이 도면 점이 화면에서 곧은 선을 따라가고 그 둘레로 돈다. */
  turn?: { size: MapSize; pivot: Point },
): Camera {
  if (e <= 0) return from;
  if (e >= 1) return to;
  if (turn && Math.abs(to.rotation - from.rotation) > 1e-9) {
    const { size, pivot } = turn;
    const s0 = from.scale;
    const s1 = to.scale;
    const scale =
      s0 > 0 && s1 > 0 ? s0 * Math.pow(s1 / s0, e) : s0 + (s1 - s0) * e;
    const rotation = from.rotation + (to.rotation - from.rotation) * e;
    const a = worldToScreen(pivot, from, size);
    const b = worldToScreen(pivot, to, size);
    return cameraKeeping(
      pivot,
      { x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e },
      scale,
      rotation,
      size,
    );
  }
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

// ---- 돌리기(2026-11-23 Ted "회전 되게 해줘. 모든 지도맵 처럼 동일하게") ----

/** 도면 크기(도면 단위). */
export interface MapSize {
  w: number;
  h: number;
}

const RAD = Math.PI / 180;

/** `deg`도 돌린 도면을 감싸는 축 정렬 상자의 너비와 높이. 0도와 180도는 도면 그대로, 90도는 둘이 바뀐다. */
export function footprint(size: MapSize, deg: number): { fw: number; fh: number } {
  const c = Math.abs(Math.cos(deg * RAD));
  const s = Math.abs(Math.sin(deg * RAD));
  // 0, 90, 180도에서 부동소수 찌꺼기(1e-16)가 맞추기 배율을 흔들지 않게 반올림한다.
  const r = (v: number) => Math.round(v * 1e9) / 1e9;
  return { fw: r(size.w * c + size.h * s), fh: r(size.w * s + size.h * c) };
}

/** 도면 좌표 → 내용 좌표(가운데 축으로 돌리고 감싸는 상자 왼쪽 위를 0으로). */
export function toContent(p: Point, size: MapSize, deg: number): Point {
  if (deg === 0) return p;
  const { fw, fh } = footprint(size, deg);
  const c = Math.cos(deg * RAD);
  const s = Math.sin(deg * RAD);
  const dx = p.x - size.w / 2;
  const dy = p.y - size.h / 2;
  return { x: fw / 2 + dx * c - dy * s, y: fh / 2 + dx * s + dy * c };
}

/** 내용 좌표 → 도면 좌표(`toContent`의 역). */
export function fromContent(p: Point, size: MapSize, deg: number): Point {
  if (deg === 0) return p;
  const { fw, fh } = footprint(size, deg);
  const c = Math.cos(deg * RAD);
  const s = Math.sin(deg * RAD);
  const dx = p.x - fw / 2;
  const dy = p.y - fh / 2;
  return { x: size.w / 2 + dx * c + dy * s, y: size.h / 2 - dx * s + dy * c };
}

/** 도면 점이 화면 어디에 그려지는지. */
export function worldToScreen(p: Point, cam: Camera, size: MapSize): Point {
  const q = toContent(p, size, cam.rotation);
  return { x: cam.offset.x + cam.scale * q.x, y: cam.offset.y + cam.scale * q.y };
}

/** 화면 점(지도 영역 안 px) 아래의 도면 점. 누르기 판정이 쓴다. */
export function screenToWorld(p: Point, cam: Camera, size: MapSize): Point {
  return fromContent(
    { x: (p.x - cam.offset.x) / cam.scale, y: (p.y - cam.offset.y) / cam.scale },
    size,
    cam.rotation,
  );
}

/** 도면 점 `world`가 화면 `screen`에 오는 카메라(배율과 각도는 주어진 대로). */
export function cameraKeeping(
  world: Point,
  screen: Point,
  scale: number,
  rotation: number,
  size: MapSize,
): Camera {
  const q = toContent(world, size, rotation);
  return {
    scale,
    rotation,
    offset: { x: screen.x - scale * q.x, y: screen.y - scale * q.y },
  };
}

/** CSS transform 문자열. 엔진이 SVG에 쓴다. 내용 좌표 정의(`toContent`)와 같은 식이다. */
export function cameraTransform(cam: Camera, size: MapSize): string {
  const { scale, offset, rotation: deg } = cam;
  const base = `translate(${offset.x}px, ${offset.y}px) scale(${scale})`;
  if (deg === 0) return base;
  const { fw, fh } = footprint(size, deg);
  return `${base} translate(${fw / 2}px, ${fh / 2}px) rotate(${deg}deg) translate(${-size.w / 2}px, ${-size.h / 2}px)`;
}

/** 두 손가락을 잇는 선의 각도(도). 손가락 순서가 같으면 돌린 만큼 바뀐다. */
export function fingerAngle(a: Point, b: Point): number {
  return Math.atan2(b.y - a.y, b.x - a.x) / RAD;
}

/** 각도 차이를 −180~180도로(손가락 선이 ±180을 넘어갈 때 한 바퀴 튀지 않게). */
export function angleDelta(from: number, to: number): number {
  let d = (to - from) % 360;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}

/** 지금 각도에서 가장 가까운 처음 방향(360의 배수). 나침반이 짧은 쪽으로 돌아온다. */
export function uprightAngle(deg: number): number {
  return Math.round(deg / 360) * 360;
}

/** 돌린 상태인지(처음 방향에서 `epsDeg` 넘게). 나침반 단추를 보일지 정한다. */
export function isRotated(deg: number, epsDeg = 0.05): boolean {
  return Math.abs(deg - uprightAngle(deg)) > epsDeg;
}

/**
 * 이름표를 칸 모양에 맞출 사분면(0~3). 글자는 늘 바로 서지만 칸은 지도와 같이 돌므로, 90도 근처에서는
 * 칸의 가로세로가 화면에서 바뀐다. 이름표는 가장 가까운 사분면이 홀수면 칸의 가로세로를 바꿔 줄을 나눈다.
 */
export function labelQuarter(deg: number): number {
  return (((Math.round(deg / 90) % 4) + 4) % 4);
}

/**
 * 도면 점이 칸(가운데 x, y, 크기 w×h, 칸 자체 각도 rotate) 안인지. 지도 각도와는 상관없다 — 누른 화면 점을
 * `screenToWorld`로 도면 점으로 돌린 뒤 이것으로 판정한다.
 */
export function pointInRect(
  p: Point,
  r: { x: number; y: number; w: number; h: number; rotate?: number },
): boolean {
  let dx = p.x - r.x;
  let dy = p.y - r.y;
  if (r.rotate) {
    const c = Math.cos(-r.rotate * RAD);
    const s = Math.sin(-r.rotate * RAD);
    [dx, dy] = [dx * c - dy * s, dx * s + dy * c];
  }
  return Math.abs(dx) <= r.w / 2 && Math.abs(dy) <= r.h / 2;
}

/**
 * 손 뗀 순간의 돌리는 속도(도/ms). `releaseVelocity`와 같은 창 규칙이다. 표본의 x에 각도를 담는다.
 */
export function releaseSpin(samples: Sample[], now: number, windowMs: number): number {
  return releaseVelocity(samples, now, windowMs).x;
}

/**
 * 글자와 표식을 바로 세우는 자리 표시. 층은 이 속성(축 x, 축 y, 이미 돌아간 각도)만 달아 두고, 엔진이 지도 각도가
 * 바뀔 때 이 속성이 달린 요소에만 SVG `transform`을 적는다(`uprightTransform`). 층은 다시 그리지 않는다.
 *
 * 처음엔 SVG 뿌리에 각도 CSS 변수 하나를 적고 글자가 `rotate(var(...))`로 받게 했다. 그런데 상속되는 변수가 바뀌면
 * 브라우저가 지도 요소 전체(SIF 914칸, 5,735개)의 스타일을 다시 계산해 손짓 한 번에 50ms 넘게 걸렸다(PR 본문 측정).
 * 바로 세울 요소에만 속성을 적으면 그 요소만 다시 계산한다.
 */
export const UPRIGHT_ATTR = "data-upright";

/** 도면 점 (ax, ay)를 축으로 바로 세울 요소에 다는 속성. `extraDeg`는 칸 자체 각도처럼 바깥에서 이미 돌아간 만큼. */
export function uprightAnchor(ax = 0, ay = 0, extraDeg = 0): Record<string, string> {
  return { [UPRIGHT_ATTR]: `${ax} ${ay} ${extraDeg}` };
}

/** 지도 각도 `deg`에서 그 요소에 적을 SVG transform. 돌릴 게 없으면 null(속성을 지운다). */
export function uprightTransform(anchor: string, deg: number): string | null {
  const [ax, ay, extra] = anchor.split(" ").map(Number);
  const a = -(deg + (extra || 0));
  const r = ((a % 360) + 360) % 360;
  if (r < 1e-9 || 360 - r < 1e-9) return null;
  return ax || ay ? `rotate(${a} ${ax} ${ay})` : `rotate(${a})`;
}
