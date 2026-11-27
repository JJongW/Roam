/**
 * 지도 부스 칸 안에 이름을 어떻게 앉힐지 — 줄과 글자 크기.
 *
 * 예전 `wrapLabel`은 한 줄 글자 수(perLine)를 넘는 단어를 **글자 단위로** 끊었다
 * ("엘리루카클/리너"). 2026-10-16 결정: **어절 단위로 줄을 바꾼다.** 띄어쓰기와 여는
 * 괄호 앞에서만 끊고, 어절 하나가 한 줄에 안 들어갈 때만 글자를 줄이되 절반까지만.
 * 그래도 안 들어갈 때만 어절 안에서 끊고 넘치는 줄은 "…" — 이름 전체는 부스를
 * 누르면 카드에 나온다.
 *
 * iOS `RoamKit/Features/FairMap/BoothNameLabel.swift`와 같은 규칙이다. 규칙 값은 Roam-design 토큰
 * `ratio.map-booth-*`(2026-11-22 `docs/decisions/2026-11-22_작은-부스-칸-이름.md`)에서 받는다.
 */
import { V2_NUM } from "@/styles/v2/lengths.generated";

/** 이름 기준 글자 크기 = 칸 짧은 변 × 이 값(1/5.5). */
export const NAME_RATIO = V2_NUM["ratio-map-booth-name"];
/** 이름 기준 글자 크기의 하한, 상한(도면 단위). */
export const NAME_MIN_UNITS = V2_NUM["ratio-map-booth-name-min-units"];
export const NAME_MAX_UNITS = V2_NUM["ratio-map-booth-name-max-units"];
export const NAME_LINE_HEIGHT = V2_NUM["ratio-map-booth-name-line-height"];
export const CODE_LINE_HEIGHT = V2_NUM["ratio-map-booth-code-line-height"];
export const CODE_RATIO = V2_NUM["ratio-map-booth-code"];
/** 글자를 이보다 작게는 줄이지 않는다(부스 기준 크기의 배수). */
export const MIN_SCALE = V2_NUM["ratio-map-booth-name-min-scale"];
/** 이름이 칸 안쪽에서 쓰는 폭의 몫(옆으로 넘치지 않게). */
export const NAME_WIDTH = V2_NUM["ratio-map-booth-name-width"];
/** 이름 안쪽 여백(한쪽, 도면 단위)과 안쪽 폭의 하한. */
export const NAME_PADDING_UNITS = V2_NUM["ratio-map-booth-name-padding-units"];
export const NAME_INNER_MIN_UNITS = V2_NUM["ratio-map-booth-name-inner-min-units"];

/** 칸(도면 단위)의 이름 기준 글자 크기. 짧은 변 × 1/5.5를 7~26으로 묶는다. */
export function labelBaseUnits(w: number, h: number): number {
  return Math.min(Math.max(Math.min(w, h) * NAME_RATIO, NAME_MIN_UNITS), NAME_MAX_UNITS);
}

/** 이름이 쓸 수 있는 칸 안쪽(도면 단위). 칸은 그리기 틈을 빼기 전 점유 칸(`g.w`, `g.h`). iOS `BoothNameLabel.inner`. */
export function labelInner(w: number, h: number): { w: number; h: number } {
  return {
    w: Math.max(NAME_INNER_MIN_UNITS, w - NAME_PADDING_UNITS * 2),
    h: Math.max(0, h - NAME_PADDING_UNITS * 2),
  };
}

export interface BoothLabelLayout {
  lines: string[];
  fontSize: number;
}

/** 줄을 바꿀 수 있는 자리로 나눈다 — 띄어쓰기, 그리고 여는 괄호 앞.
 *  부스 이름은 "브랜드(회사)" 꼴이 많고 괄호 앞에 띄어쓰기가 없다. */
export function labelWords(name: string): string[] {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .flatMap((chunk) => chunk.split(/(?=\()/).filter(Boolean));
}

/** 글자 폭 어림치(em) — 한글·한자 한 칸, ASCII 0.55칸. */
export function emWidth(text: string): number {
  let w = 0;
  for (const ch of text) w += ch.charCodeAt(0) < 128 ? 0.55 : 1;
  return w;
}

function pack(tokens: string[], perLine: number): string[] | null {
  const lines: string[] = [];
  let cur = "";
  for (const t of tokens) {
    if (emWidth(t) > perLine) return null;
    // 괄호로 시작하는 조각은 앞 조각에 띄어쓰기 없이 붙어 있던 것이다.
    const joined = cur ? cur + (t.startsWith("(") ? "" : " ") + t : t;
    if (emWidth(joined) <= perLine) cur = joined;
    else {
      lines.push(cur);
      cur = t;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

function hardBreak(token: string, perLine: number): string[] {
  const parts: string[] = [];
  let cur = "";
  for (const ch of token) {
    if (cur && emWidth(cur + ch) > perLine) {
      parts.push(cur);
      cur = "";
    }
    cur += ch;
  }
  if (cur) parts.push(cur);
  return parts;
}

function lineBudget(size: number, height: number, hasCode: boolean): number {
  const code = hasCode ? size * CODE_RATIO * CODE_LINE_HEIGHT : 0;
  return Math.max(1, Math.floor((height - code) / (size * NAME_LINE_HEIGHT)));
}

/** `width`·`height`는 글자가 쓸 수 있는 칸 안쪽(도면 단위). */
export function layoutBoothLabel(
  name: string,
  base: number,
  width: number,
  height: number,
  hasCode: boolean,
): BoothLabelLayout {
  const tokens = labelWords(name);
  if (tokens.length === 0) return { lines: [], fontSize: base };

  // 큰 글자부터 내려가며 "어절이 안 잘리고, 줄이 칸 높이에 들어가는" 첫 크기.
  const floor = base * MIN_SCALE;
  let size = base;
  for (;;) {
    const lines = pack(tokens, width / size);
    if (lines && lines.length <= lineBudget(size, height, hasCode))
      return { lines, fontSize: size };
    if (size <= floor) break;
    size = Math.max(size * 0.94, floor);
  }

  const maxLines = lineBudget(floor, height, hasCode);
  const perLine = width / floor;
  const broken = tokens.flatMap((t) => hardBreak(t, perLine));
  let lines = pack(broken, perLine) ?? broken;
  if (lines.length > maxLines) {
    lines = lines.slice(0, maxLines);
    let last = lines[maxLines - 1];
    while (last && emWidth(last + "…") > perLine) last = [...last].slice(0, -1).join("");
    lines[maxLines - 1] = last + "…";
  }
  return { lines, fontSize: floor };
}

/**
 * 작은 하트 칸의 오른쪽 위 하트(UI 21 Q2 A, 2026-11-22). 칸 가운데가 원점인 그리는 칸(`w`×`h`) 안에서
 * 하트 크기 = 짧은 변 × `ratio.map-booth-heart-corner`, 가장자리 사이 = 짧은 변 × `…-heart-corner-inset`.
 * iOS `BoothNameLabel.Corner`와 같다.
 */
export interface HeartCorner {
  x: number;
  y: number;
  size: number;
  /** 하트와 같은 높이에 걸리는 줄의 최대 폭. 줄은 가운데 정렬이라 하트 왼쪽 끝까지의 두 배. */
  maxLineWidth: number;
  /** 하트 아래 끝(칸 가운데에서 잰 세로 자리, 위가 음수). 줄 위 끝이 이보다 위면 하트와 같은 높이다. */
  bottom: number;
}

export function heartCorner(w: number, h: number): HeartCorner {
  const short = Math.min(w, h);
  const size = short * V2_NUM["ratio-map-booth-heart-corner"];
  const inset = short * V2_NUM["ratio-map-booth-heart-corner-inset"];
  const x = w / 2 - inset - size;
  const y = -h / 2 + inset;
  return { x, y, size, maxLineWidth: Math.max(0, x * 2), bottom: y + size };
}

/** 줄마다 폭이 다른 `pack`(iOS `pack(widths:joinsTight:perLine:)`). 폭이 모두 같으면 `pack`과 같다. */
function packVar(tokens: string[], perLine: (line: number) => number): string[] | null {
  const lines: string[] = [];
  let cur = "";
  for (const t of tokens) {
    if (!cur) {
      if (emWidth(t) > perLine(lines.length)) return null;
      cur = t;
      continue;
    }
    const joined = cur + (t.startsWith("(") ? "" : " ") + t;
    if (emWidth(joined) <= perLine(lines.length)) cur = joined;
    else {
      lines.push(cur);
      if (emWidth(t) > perLine(lines.length)) return null;
      cur = t;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

/** 위에서 `narrowCount` 줄은 폭 `narrow`, 나머지는 `width`. 번호 줄은 없다(하트 칸은 이름만). */
function layoutNarrowed(
  tokens: string[],
  base: number,
  width: number,
  height: number,
  narrow: number,
  narrowCount: number,
): BoothLabelLayout {
  const widest = Math.max(...tokens.map(emWidth));
  const floor = base * MIN_SCALE;
  let size = base;
  for (;;) {
    const s = size;
    const lines = widest <= width / s ? packVar(tokens, (i) => (i < narrowCount ? narrow : width) / s) : null;
    if (lines && lines.length <= lineBudget(s, height, false)) return { lines, fontSize: s };
    if (size <= floor) break;
    size = Math.max(size * 0.94, floor);
  }
  const maxLines = lineBudget(floor, height, false);
  const perLine = (i: number) => (i < narrowCount ? narrow : width) / floor;
  // 좁힌 줄이 있으면 조각은 좁힌 폭으로 끊는다(어느 줄에 앉아도 들어가게).
  const broken = tokens.flatMap((t) => hardBreak(t, perLine(0)));
  let lines = packVar(broken, perLine) ?? broken;
  if (lines.length > maxLines) {
    lines = lines.slice(0, maxLines);
    let last = lines[maxLines - 1];
    while (last && emWidth(last + "…") > perLine(maxLines - 1)) last = [...last].slice(0, -1).join("");
    lines[maxLines - 1] = last + "…";
  }
  return { lines, fontSize: floor };
}

/**
 * 작은 하트 칸의 이름(도면 단위). 크기 규칙은 보통 이름과 같고(칸 `w`×`h`는 점유 칸), 하트 높이에 걸리는
 * 위쪽 줄은 가운데 그대로 두고 양쪽 폭을 같이 좁혀 하트와 겹치지 않게 한다. 지도 배율과 상관없다.
 * iOS `BoothNameLabel.layout(…, corner:)`와 같다.
 */
export function layoutCornerName(
  name: string,
  w: number,
  h: number,
  corner: HeartCorner,
): BoothLabelLayout {
  const tokens = labelWords(name);
  const base = labelBaseUnits(w, h);
  if (tokens.length === 0) return { lines: [], fontSize: base };
  const inner = labelInner(w, h);
  const width = inner.w * NAME_WIDTH;
  const narrow = Math.min(width, corner.maxLineWidth);
  // 좁히면 줄이 늘거나 글자가 줄어 걸리는 줄이 바뀔 수 있어, 걸리는 줄이 모두 좁혀질 때까지 다시 잰다.
  let count = 0;
  for (;;) {
    const l = layoutNarrowed(tokens, base, width, inner.h, narrow, count);
    const lineH = l.fontSize * NAME_LINE_HEIGHT;
    const top = (-lineH * l.lines.length) / 2;
    const hit = l.lines.filter((_, i) => top + i * lineH < corner.bottom).length;
    if (hit <= count || count >= l.lines.length) return l;
    count = hit;
  }
}

/**
 * 글자 크기를 `size`로 고정하고 줄만 나눈다(줄이지 않는다). 위에서 `narrowCount` 줄은 폭 `narrow`, 나머지는 `width`.
 * 가장 긴 어절이 안 들어가거나 줄이 `height`를 넘으면 null. 번호 줄은 없다. iOS `BoothNameLabel.pack`과 같다.
 */
export function packAtSize(
  name: string,
  size: number,
  width: number,
  height: number,
  narrow: number,
  narrowCount: number,
): BoothLabelLayout | null {
  const tokens = labelWords(name);
  if (size <= 0 || tokens.length === 0) return null;
  if (Math.max(...tokens.map(emWidth)) > width / size) return null;
  const lines = packVar(tokens, (i) => (i < narrowCount ? narrow : width) / size);
  if (!lines || lines.length > lineBudget(size, height, false)) return null;
  return { lines, fontSize: size };
}
