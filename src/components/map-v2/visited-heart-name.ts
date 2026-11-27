/**
 * 다녀온 칸이면서 하트도 남긴 칸의 이름 자리(UI 26-F4, Figma `UI/지도/다녀온 칸` 하트 있음 3411:31726:
 * 98×50 칸에 이름 x 7 y 5, 하트 x 80 y 3 크기 15).
 *
 * 2026-11-27 헤더: 이름은 오른쪽 위 하트(짧은 변 × 0.3)를 덮지 않고(겹침 0), 하트 때문에 글자를 줄이지 않는다.
 * 글자 크기는 같은 크기의 다른 칸과 같은 규칙(`layoutBoothLabel`, UI 21 이름 토큰)으로 먼저 정하고, 그 크기로
 * 1) 왼쪽 위부터, 하트 높이에 걸리는 줄만 하트 왼쪽까지 좁혀 줄을 바꾼다.
 * 2) 안 되면 하트 아래부터 같은 크기로 쓴다.
 * 3) 그래도 안 들어가면 하트 아래 남은 자리에 다른 칸과 같은 규칙(줄이기 포함)을 쓴다.
 * 4) 남은 자리도 없으면 하트 왼쪽 띠에 같은 규칙. 넘치는 몫은 그리는 쪽이 하트 자리를 잘라 낸다(안전망).
 *
 * iOS `FairMapCanvas.swift`의 `VisitedHeartName`(Roam-ios a771057)과 같은 순서다. 다른 점: 웹은 실제 글꼴 폭을 잴 수
 * 없어 `emWidth` 어림에 굵은 글자 몫(`BOLD_EM_SLACK`)을 얹어 넘침을 잰다. 또 웹 지도는 도면 단위로 한 번 그리고 확대는
 * SVG transform이라, 자리는 배율과 상관없이 칸 크기만으로 정해진다.
 */
import {
  emWidth,
  heartCorner,
  labelBaseUnits,
  labelInner,
  layoutBoothLabel,
  NAME_LINE_HEIGHT,
  NAME_PADDING_UNITS,
  NAME_WIDTH,
  packAtSize,
  type BoothLabelLayout,
} from "@/components/map/booth-label";
import { V2_NUM } from "@/styles/v2/lengths.generated";

/**
 * 어림 폭(em)에 얹는 굵은 글자 몫. 디자인 값이 아니라 어림을 실제 굵은 Pretendard 폭 쪽으로 넉넉히 잡는 측정 보정이다
 * ("&", "W" 같은 ASCII가 0.55em 어림보다 넓다).
 */
export const BOLD_EM_SLACK = 1.12;

/** 줄 바꿈 자리를 찾는 걸음(iOS `slacks`와 같다). 글자 크기가 아니라 줄 폭만 좁혀 줄을 일찍 바꾼다. */
const SLACKS = [1, 0.92, 0.85, 0.78, 0.7, 0.62];

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface VisitedHeartName {
  layout: BoothLabelLayout;
  /** 글자 덩어리 왼쪽 위(칸 가운데가 원점, 도면 단위). */
  origin: { x: number; y: number };
  heart: Box;
  /** 하트와 글자 사이(= 하트와 칸 가장자리 사이, 짧은 변 × inset). */
  gap: number;
}

/** 그려질 줄 상자들(어림 폭 × 굵은 글자 몫). 줄 가운데에 `dominant-baseline: central`로 그린다. */
export function nameLineBoxes(l: BoothLabelLayout, origin: { x: number; y: number }): Box[] {
  const lineH = l.fontSize * NAME_LINE_HEIGHT;
  return l.lines.map((line, i) => ({
    x: origin.x,
    y: origin.y + lineH * i,
    w: emWidth(line) * l.fontSize * BOLD_EM_SLACK,
    h: lineH,
  }));
}

/**
 * @param cellW 점유 칸(그리기 틈 빼기 전). 이름 크기 규칙이 쓴다.
 * @param drawW 그리는 칸(틈 뺀 뒤, 이름표 방향). 하트와 여백이 쓴다.
 */
export function placeVisitedHeartName(
  name: string,
  cellW: number,
  cellH: number,
  drawW: number,
  drawH: number,
): VisitedHeartName {
  const c = heartCorner(drawW, drawH);
  const heart: Box = { x: c.x, y: c.y, w: c.size, h: c.size };
  const gap = Math.min(drawW, drawH) * V2_NUM["ratio-map-booth-heart-corner-inset"];
  const pad = NAME_PADDING_UNITS;
  const left = -drawW / 2 + pad;
  const right = drawW / 2 - pad;
  const top = -drawH / 2 + pad;
  const bottom = drawH / 2 - pad;
  const base = labelBaseUnits(cellW, cellH);
  const inner = labelInner(cellW, cellH);
  // 같은 크기 다른 칸의 글자 크기(UI 21).
  const size = layoutBoothLabel(name, base, inner.w * NAME_WIDTH, inner.h, false).fontSize;
  const fullWidth = Math.max(0, right - left);
  const narrowWidth = Math.max(0, heart.x - gap - left);
  const heartBand = heart.y + heart.h + gap;
  const lineH = size * NAME_LINE_HEIGHT;

  // 하트 높이 줄은 굵은 글자 몫을 얹은 폭으로 하트 왼쪽(틈 빼고)까지, 나머지 줄은 다른 칸과 같은 어림 폭으로 오른쪽 여백까지.
  const fits = (l: BoothLabelLayout, origin: { x: number; y: number }) =>
    nameLineBoxes(l, origin).every((r) => {
      if (r.y + r.h > bottom + 0.5) return false;
      if (r.y < heartBand) return r.x + r.w <= heart.x - gap + 0.5;
      return r.x + r.w / BOLD_EM_SLACK <= right + 0.5;
    });
  const make = (layout: BoothLabelLayout, origin: { x: number; y: number }): VisitedHeartName => ({
    layout,
    origin,
    heart,
    gap,
  });

  // 1) 왼쪽 위, 하트 높이 줄만 좁힌다. 좁히는 줄 수는 늘기만 한다.
  const topLeft = { x: left, y: top };
  for (const k of SLACKS) {
    let count = 0;
    for (;;) {
      const l = packAtSize(name, size, fullWidth * k, bottom - top, narrowWidth * k, count);
      if (!l) break;
      const hit = l.lines.filter((_, i) => top + lineH * i < heartBand).length;
      if (hit <= count) {
        if (fits(l, topLeft)) return make(l, topLeft);
        break;
      }
      count = hit;
    }
  }
  // 2) 하트 아래부터, 같은 크기 그대로.
  const below = { x: left, y: heartBand };
  for (const k of SLACKS) {
    const l = packAtSize(name, size, fullWidth * k, bottom - below.y, fullWidth * k, 0);
    if (l && fits(l, below)) return make(l, below);
  }
  // 3) 하트 아래 남은 자리에 다른 칸과 같은 규칙.
  if (bottom - below.y > 0) {
    const l = layoutBoothLabel(name, base, fullWidth, bottom - below.y, false);
    if (fits(l, below)) return make(l, below);
  }
  // 4) 하트 왼쪽 띠에 같은 규칙. 넘치는 몫은 그리는 쪽이 하트 자리를 잘라 낸다.
  // 어림 폭에 굵은 글자 몫을 미리 빼 두어 어림으로도 하트 왼쪽 안에 들게 한다.
  return make(layoutBoothLabel(name, base, narrowWidth / BOLD_EM_SLACK, bottom - top, false), topLeft);
}
