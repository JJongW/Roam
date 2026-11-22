/**
 * 하트 칸의 두 모양(UI 21 Q2 A, 2026-11-22 Ted "웹도 동일하게 진행").
 *
 * - 작은 칸(그리는 칸이 화면에서 `size.map-booth-small-width`×`…-height`(34×20) 미만): 하트는 칸 오른쪽 위에
 *   작게(`heartCorner`), 이름은 가운데 그대로. 하트 높이에 걸리는 줄은 양쪽을 같이 좁힌다(`layoutCornerName`).
 *   크기가 전부 칸에 비례해 지도 배율과 상관없다 — 도면 단위로 한 번만 잰다.
 * - 큰 칸: Figma UI 부품 "상태=하트"처럼 하트(`icon-size-sm` 16)와 사이(`spacing-x1` 4)를 이름 왼쪽에 두고 이름은 굵게.
 *   하트와 사이는 화면 px라 배율마다 도면 단위 폭이 다르다.
 *
 * 지도 층은 확대해도 다시 그리지 않는다(SVG transform과 라벨 단계 `--map-zoom-level`만 바뀐다). 그래서 두 모양을
 * 다 그려 두고 단계로 바꿔 끼운다. 큰 모양은 이름 줄이 하트 몫(20px)에 따라 달라지므로 단계마다 재고, 같은 줄이
 * 이어지는 단계끼리 묶어 한 벌씩 그린다(`bands`). 하트 크기는 CSS가 단계에서 계산한다(map-layer.tsx).
 *
 * iOS `FairMapCanvas.drawBooth`(하트 칸)와 `BoothNameLabel`과 같은 규칙이다. 다른 점은 단계가 내림이라
 * 바뀌는 자리가 iOS보다 최대 한 단계(배율 2^(1/4) ≈ 1.19배) 늦고, 큰 모양의 하트가 화면에서 16~19px로
 * 단계마다 계단처럼 변한다는 것(iOS는 늘 16).
 */
import {
  emWidth,
  heartCorner,
  labelBaseUnits,
  labelInner,
  layoutBoothLabel,
  layoutCornerName,
  NAME_LINE_HEIGHT,
  NAME_WIDTH,
  type BoothLabelLayout,
  type HeartCorner,
} from "@/components/map/booth-label";
import { levelScale, sizeLevel } from "@/components/map/map-camera";
import { V2_PX } from "@/styles/v2/lengths.generated";

/** 이보다 작게 보이는 칸은 작은 칸이다(화면 px). */
export const SMALL_CELL_W = V2_PX["size-map-booth-small-width"];
export const SMALL_CELL_H = V2_PX["size-map-booth-small-height"];
/** 큰 칸 하트 크기와 이름까지 사이(화면 px). */
export const HEART_ICON_PX = V2_PX["icon-size-sm"];
export const HEART_GAP_PX = V2_PX["spacing-x1"];

/** 단계 `level`에서 화면 1px이 도면 몇 단위인지(단계 배율의 역수). CSS가 같은 식을 쓴다. */
export function unitsPerPx(level: number): number {
  return 1 / levelScale(level);
}

export interface LargeBand {
  /** 이 이름 줄이 쓰이는 단계 [from, to). 첫 묶음의 from은 아래로 열려 있다(-Infinity). */
  from: number;
  to: number;
  name: BoothLabelLayout;
  /** 이름 줄 중 가장 긴 줄의 폭(도면 단위). */
  blockW: number;
}

export interface HeartCellLayout {
  /** 이 단계부터 큰 모양(그리는 칸이 화면에서 34×20 이상). */
  level: number;
  small: { heart: HeartCorner; name: BoothLabelLayout };
  /** 하트 크기 계산의 아래 끝 단계. 이보다 멀어지면 하트도 지도와 같이 줄어 이름을 덮지 않는다. */
  largeFrom: number;
  large: LargeBand[];
}

/** 이름 줄 폭(도면 단위, 어림). 그리기와 겹침 검사가 같은 값을 쓴다. */
export function lineWidth(line: string, fontSize: number): number {
  return emWidth(line) * fontSize;
}

function blockWidth(l: BoothLabelLayout): number {
  return l.lines.reduce((m, line) => Math.max(m, lineWidth(line, l.fontSize)), 0);
}

/** 단계 `level`의 큰 모양 이름 줄. 하트와 사이(화면 20px)를 그 단계의 도면 단위로 빼고 잰다. iOS와 같다. */
function largeName(name: string, cellW: number, cellH: number, iconUnits: number): BoothLabelLayout {
  const inner = labelInner(cellW, cellH);
  return layoutBoothLabel(
    name,
    labelBaseUnits(cellW, cellH),
    Math.max(0, inner.w - iconUnits) * NAME_WIDTH,
    inner.h,
    false,
  );
}

const same = (a: BoothLabelLayout, b: BoothLabelLayout) =>
  a.fontSize === b.fontSize && a.lines.join("\n") === b.lines.join("\n");

/** 단계를 몇 개까지 볼지. 하트 몫이 1/2^(이 값/4)로 줄면 이름 줄은 더 바뀌지 않는다고 보고 멈춘다. */
const MAX_LEVEL_SPAN = 64;

/**
 * @param cellW 점유 칸(그리기 틈 빼기 전, `g.w`). 이름 크기 규칙이 쓴다.
 * @param drawW 그리는 칸(틈 뺀 뒤). 작은 칸 기준과 하트 자리가 쓴다.
 * @param floorLevel 큰 모양을 재기 시작할 가장 낮은 단계(보통 맞춤 배율의 한 옥타브 아래). 없으면 문턱 단계부터.
 */
export function heartCellLayout(
  name: string,
  cellW: number,
  cellH: number,
  drawW: number,
  drawH: number,
  floorLevel?: number,
): HeartCellLayout {
  const level = sizeLevel(drawW, drawH, SMALL_CELL_W, SMALL_CELL_H);
  const heart = heartCorner(drawW, drawH);
  const small = { heart, name: layoutCornerName(name, cellW, cellH, heart) };

  const largeFrom = Math.max(level, floorLevel ?? level);
  const iconPx = HEART_ICON_PX + HEART_GAP_PX;
  // 하트 몫이 0일 때의 줄 — 더 들어가도 이보다 넓어지지 않는다.
  const limit = largeName(name, cellW, cellH, 0);
  const large: LargeBand[] = [];
  for (let lv = largeFrom; lv < largeFrom + MAX_LEVEL_SPAN; lv++) {
    const l = largeName(name, cellW, cellH, iconPx * unitsPerPx(lv));
    const last = large[large.length - 1];
    if (last && same(last.name, l)) last.to = lv + 1;
    else large.push({ from: last ? lv : -Infinity, to: lv + 1, name: l, blockW: blockWidth(l) });
    if (same(l, limit)) break;
  }
  large[large.length - 1].to = Infinity;
  return { level, small, largeFrom, large };
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 이름 줄 상자들(도면 단위). 줄은 세로 가운데로 쌓고, `left`가 없으면 가로 가운데. */
export function nameBoxes(l: BoothLabelLayout, left?: number): Box[] {
  const lineH = l.fontSize * NAME_LINE_HEIGHT;
  const top = (-lineH * l.lines.length) / 2;
  return l.lines.map((line, i) => {
    const w = lineWidth(line, l.fontSize);
    return { x: left ?? -w / 2, y: top + i * lineH, w, h: lineH };
  });
}

/** 큰 모양을 단계 `zoomLevel`에서 그릴 자리(도면 단위). map-layer.tsx의 CSS 식과 같은 계산. */
export function largeBoxes(cell: HeartCellLayout, zoomLevel: number): { heart: Box; lines: Box[] } {
  const band =
    cell.large.find((b) => zoomLevel >= b.from && zoomLevel < b.to) ?? cell.large[0];
  const k = unitsPerPx(Math.max(zoomLevel, cell.largeFrom));
  const left = -band.blockW / 2;
  return {
    heart: {
      x: left - ((HEART_ICON_PX + HEART_GAP_PX) / 2) * k,
      y: (-HEART_ICON_PX / 2) * k,
      w: HEART_ICON_PX * k,
      h: HEART_ICON_PX * k,
    },
    lines: nameBoxes(band.name, left + ((HEART_ICON_PX + HEART_GAP_PX) / 2) * k),
  };
}

export function overlaps(a: Box, b: Box): boolean {
  const eps = 1e-9;
  return a.x < b.x + b.w - eps && b.x < a.x + a.w - eps && a.y < b.y + b.h - eps && b.y < a.y + a.h - eps;
}
