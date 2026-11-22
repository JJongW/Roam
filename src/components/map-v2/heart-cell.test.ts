import { describe, expect, it } from "vitest";
import { FLOORPLANS } from "@/lib/floorplans";
import {
  labelFadeStyle,
  levelBandStyle,
  levelScale,
  zoomLevel,
} from "@/components/map/map-camera";
import {
  heartCellLayout,
  largeBoxes,
  nameBoxes,
  overlaps,
  SMALL_CELL_H,
  SMALL_CELL_W,
  type Box,
} from "./heart-cell";

// UI 21 Q2 A(2026-11-22): 하트 칸의 하트와 이름 줄이 겹치지 않는다. 서울카페쇼 도면 615칸 전부를 하트 칸으로 보고
// 여러 배율에서 잰다. 이름 줄 폭은 그리기와 같은 어림(booth-label.ts emWidth)이다.
const fp = FLOORPLANS["cafeshow-2026"];
/** map-layer.tsx CELL_GAP(칸끼리 통로)과 같은 값. */
const CELL_GAP = 3;
// 홀 하나 폭 맞춤(0.228)부터 확대 상한 근처까지.
const SCALES = [0.12, 0.17, 0.228, 0.3, 0.4, 0.567, 0.75, 1, 1.4, 2, 3, 4];
// 맞춤 배율 단계(웹 map-layer는 맞춤 배율의 한 옥타브 아래부터 큰 모양을 잰다).
const FIT_LEVEL = zoomLevel(0.228);

const cells = fp.booths.map((b) => {
  const name = (b as { name?: string }).name ?? b.code ?? "";
  const w = Math.max(8, b.w - CELL_GAP * 2);
  const h = Math.max(8, b.h - CELL_GAP * 2);
  return { b, name, w, h, cell: heartCellLayout(name, b.w, b.h, w, h, FIT_LEVEL - 4) };
});

const inside = (box: Box, w: number, h: number) =>
  box.x >= -w / 2 - 1e-9 &&
  box.x + box.w <= w / 2 + 1e-9 &&
  box.y >= -h / 2 - 1e-9 &&
  box.y + box.h <= h / 2 + 1e-9;

describe("하트 칸(UI 21 Q2 A) — 서울카페쇼 615칸", () => {
  it("이름이 있는 칸이 615개다", () => {
    expect(cells.filter((c) => c.name).length).toBe(615);
  });

  it("작은 모양: 오른쪽 위 하트와 이름 줄 겹침 0(배율과 상관없는 도면 단위)", () => {
    const hits = cells.filter(({ cell }) => {
      const { heart, name } = cell.small;
      const hb = { x: heart.x, y: heart.y, w: heart.size, h: heart.size };
      return nameBoxes(name).some((l) => overlaps(hb, l));
    });
    expect(hits.map((c) => c.b.code)).toEqual([]);
  });

  it("작은 모양: 하트는 칸 안 오른쪽 위, 크기는 짧은 변 × 0.3", () => {
    for (const { w, h, cell } of cells) {
      const { heart } = cell.small;
      expect(heart.size).toBeCloseTo(Math.min(w, h) * 0.3, 9);
      expect(inside({ x: heart.x, y: heart.y, w: heart.size, h: heart.size }, w, h)).toBe(true);
      expect(heart.x + heart.size).toBeCloseTo(w / 2 - Math.min(w, h) * 0.06, 9);
    }
  });

  it.each(SCALES)("배율 %s: 보이는 모양에서 하트와 이름 줄 겹침 0, 큰 모양은 칸 안", (s) => {
    const level = zoomLevel(s);
    let small = 0;
    let large = 0;
    const hits: string[] = [];
    for (const { b, w, h, cell } of cells) {
      // 화면에서 34×20 미만이면 반드시 작은 모양이다(단계가 내림이라 큰 모양은 최대 한 단계 늦게 나온다).
      if (w * s < SMALL_CELL_W || h * s < SMALL_CELL_H) expect(level).toBeLessThan(cell.level);
      if (level < cell.level) {
        small++;
        continue; // 작은 모양은 위에서 배율과 상관없이 쟀다.
      }
      large++;
      expect(w * levelScale(level)).toBeGreaterThanOrEqual(SMALL_CELL_W - 1e-9);
      expect(h * levelScale(level)).toBeGreaterThanOrEqual(SMALL_CELL_H - 1e-9);
      const { heart, lines } = largeBoxes(cell, level);
      if (lines.some((l) => overlaps(heart, l))) hits.push(b.code);
      expect(inside(heart, w, h), `${b.code} 하트`).toBe(true);
      for (const l of lines) expect(l.x + l.w <= w / 2 + 1e-9, `${b.code} 이름 폭`).toBe(true);
    }
    expect(hits).toEqual([]);
    expect(small + large).toBe(615);
  });

  it("큰 모양 이름 줄 묶음은 모든 단계를 빈틈없이 나눈다(어느 단계든 하나만 보인다)", () => {
    for (const { cell } of cells) {
      expect(cell.large[0].from).toBe(-Infinity);
      expect(cell.large[cell.large.length - 1].to).toBe(Infinity);
      for (let i = 1; i < cell.large.length; i++) expect(cell.large[i].from).toBe(cell.large[i - 1].to);
    }
    // 그리는 벌 수(층 무게). 서울카페쇼는 칸마다 1~12벌, 하트 칸에만 그린다.
    const max = Math.max(...cells.map((c) => c.cell.large.length));
    expect(max).toBeLessThanOrEqual(16);
  });
});

/** heart-label.tsx가 쓰는 opacity 식을 단계 `v`에서 계산한다(CSS clamp, min, calc, var만 쓰는 식). */
function evalOpacity(css: string | number | undefined, v: number): number {
  if (css === undefined) return 1;
  const js = String(css)
    .replace(/var\(--map-zoom-level(, [-0-9.]+)?\)/g, `(${v})`)
    .replace(/clamp\(/g, "clamp(")
    .replace(/calc\(/g, "(")
    .replace(/min\(/g, "Math.min(");
  return new Function("clamp", `return ${js};`)(
    (a: number, b: number, c: number) => Math.min(Math.max(b, a), c),
  ) as number;
}

describe("하트 칸 이름은 어느 단계에서도 숨지 않는다(2026-10-15 결정)", () => {
  it("작은 모양과 큰 모양, 큰 모양의 묶음은 정수 단계마다 정확히 하나만 보인다", () => {
    for (const { cell } of cells.slice(0, 80)) {
      for (let v = -24; v <= 16; v++) {
        const small = evalOpacity(labelFadeStyle(cell.level, 1, { below: true }).opacity, v);
        const large = evalOpacity(labelFadeStyle(cell.level).opacity, v);
        const bands = cell.large.map((b) => evalOpacity(levelBandStyle(b.from, b.to).opacity, v));
        expect(small + large).toBe(1);
        expect(bands.reduce((a, b) => a + b, 0)).toBe(1);
      }
    }
  });
});
