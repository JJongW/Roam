/**
 * 시설 칸(`kind: facility`, 주최 프로그램, 무대, 편의시설) 이름을 어디에 몇 줄로 앉힐지.
 *
 * iOS `RoamKit/Features/FairMap/FacilityLabel.swift`(PR #234, 2026-11-24 P1-2)와 같은 규칙이다.
 * - 어절(띄어쓰기, 여는 괄호 앞) 단위로만 줄을 바꾸고 어절 안에서는 끊지 않는다.
 * - 글자를 줄이지 않고 "…"도 붙이지 않는다. 칸 안에 다 들어갈 때만 칸 안에 그린다.
 * - 칸이 얇아(벽에 붙은 무대 막대, SDF 2026 A-05) 안에 안 들어가면 공식 배치도처럼 칸 바로 옆 빈 바닥에 쓴다.
 *   오른쪽을 먼저, 안 되면 왼쪽. 다른 칸을 덮거나 홀 밖으로 나가면 쓰지 않는다.
 *
 * 부스 이름(UI 21, `booth-label.ts`)과는 다른 규칙이다. 글자 크기만 부스 이름과 같은 기준 크기
 * (`labelBaseUnits`, 토큰 `ratio.map-booth-name*`)를 쓴다. 웹 지도는 도면 단위로 그려 지도와 같이 커지므로
 * iOS처럼 화면 글자 크기(labelSm)로 쓰지 않는다.
 */
import { V2_PX } from "@/styles/v2/lengths.generated";
import {
  emWidth,
  labelBaseUnits,
  labelInner,
  labelWords,
  NAME_LINE_HEIGHT,
  NAME_WIDTH,
} from "./booth-label";

/** 칸과 옆 글자 사이(도면 단위). iOS `V2Space.x1`과 같은 토큰. */
export const FACILITY_BESIDE_GAP = V2_PX["spacing-x1"];

/** 가운데가 (x, y)인 상자(도면 단위, 엔진 `MapRect`와 같은 꼴). */
export interface CenterRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 왼쪽 위가 (x, y)인 상자(홀 바닥판). */
export interface TopLeftRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * 어절을 앞에서부터 `maxWidth` 안에 채운다. 어절 하나가 `maxWidth`보다 길면 null(어절 안에서 끊지 않는다).
 * iOS `FacilityLabel.wrap`.
 */
export function wrapFacilityName(
  name: string,
  maxWidth: number,
  measure: (s: string) => number,
): string[] | null {
  const words = labelWords(name);
  if (words.length === 0 || maxWidth <= 0) return null;
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if (measure(w) > maxWidth) return null;
    if (!cur) {
      cur = w;
      continue;
    }
    const joined = cur + (w.startsWith("(") ? "" : " ") + w;
    if (measure(joined) <= maxWidth) cur = joined;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

export interface FacilityInside {
  lines: string[];
  fontSize: number;
}

/**
 * 칸(점유 칸, 도면 단위) 안에 쓸 줄. 다 들어가지 않으면 null — 그때는 옆에 쓰거나(`facilityBeside`) 그리지 않는다.
 * 글자 크기는 부스 이름 기준 크기 그대로이고 줄이지 않는다.
 */
export function layoutFacilityInside(name: string, cellW: number, cellH: number): FacilityInside | null {
  const fontSize = labelBaseUnits(cellW, cellH);
  const inner = labelInner(cellW, cellH);
  const lines = wrapFacilityName(name, inner.w * NAME_WIDTH, (s) => emWidth(s) * fontSize);
  if (!lines || lines.length * fontSize * NAME_LINE_HEIGHT > inner.h) return null;
  return { lines, fontSize };
}

/**
 * 칸 바로 옆 빈 바닥에 둘 글자 상자(가운데 기준). 오른쪽을 먼저, 안 되면 왼쪽. 세로는 칸 가운데.
 * iOS `FacilityLabel.besideRect`.
 * @param size 글자 덩어리 크기
 * @param cell 시설 칸
 * @param avoid 덮으면 안 되는 칸들(`cell` 자신은 건너뛴다)
 * @param floors 글자가 들어가야 하는 바닥(홀). 비어 있으면 보지 않는다.
 */
export function besideRect(
  size: { w: number; h: number },
  cell: CenterRect,
  gap: number,
  avoid: CenterRect[],
  floors: TopLeftRect[],
): CenterRect | null {
  const candidates: CenterRect[] = [
    { x: cell.x + cell.w / 2 + gap + size.w / 2, y: cell.y, w: size.w, h: size.h },
    { x: cell.x - cell.w / 2 - gap - size.w / 2, y: cell.y, w: size.w, h: size.h },
  ];
  return (
    candidates.find((r) => {
      // 맞닿기만 한 것은 겹침으로 치지 않는다.
      const inner = { ...r, w: r.w - 1, h: r.h - 1 };
      if (avoid.some((a) => !sameRect(a, cell) && intersects(a, inner))) return false;
      return floors.length === 0 || floors.some((f) => contains(f, r));
    }) ?? null
  );
}

export interface FacilityBeside {
  /** 글자 상자(가운데 기준, 도면 단위). */
  rect: CenterRect;
  fontSize: number;
}

/**
 * 칸 안에 안 들어가는 시설 이름을 칸 옆에 쓸 자리. 칸 기울기가 있으면 옆이 어딘지 모호해 쓰지 않는다(iOS와 같다).
 * 글자가 막대(칸 높이)보다 길면 쓰지 않는다 — 작은 막대 옆에 큰 글자가 뜨지 않게.
 */
export function facilityBeside(
  name: string,
  cell: CenterRect & { rotate?: number },
  avoid: CenterRect[],
  floors: TopLeftRect[],
): FacilityBeside | null {
  if (cell.rotate) return null;
  const title = name.trim();
  if (!title) return null;
  const fontSize = labelBaseUnits(cell.w, cell.h);
  const size = { w: emWidth(title) * fontSize, h: fontSize * NAME_LINE_HEIGHT };
  if (size.w > cell.h) return null;
  const rect = besideRect(size, cell, FACILITY_BESIDE_GAP, avoid, floors);
  return rect && { rect, fontSize };
}

function sameRect(a: CenterRect, b: CenterRect): boolean {
  return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
}

function intersects(a: CenterRect, b: CenterRect): boolean {
  return (
    Math.abs(a.x - b.x) * 2 < a.w + b.w && Math.abs(a.y - b.y) * 2 < a.h + b.h
  );
}

function contains(f: TopLeftRect, r: CenterRect): boolean {
  return (
    r.x - r.w / 2 >= f.x &&
    r.x + r.w / 2 <= f.x + f.w &&
    r.y - r.h / 2 >= f.y &&
    r.y + r.h / 2 <= f.y + f.h
  );
}
