import { describe, expect, it } from "vitest";
import {
  CODE_RATIO,
  emWidth,
  labelBaseUnits,
  labelInner,
  layoutBoothLabel,
  NAME_LINE_HEIGHT,
  NAME_WIDTH,
} from "@/components/map/booth-label";
import { nameLineBoxes, placeVisitedHeartName, type Box } from "./visited-heart-name";

/**
 * 다녀온 하트 칸 이름은 하트를 덮지 않는다(겹침 0), 하트 때문에 글자를 줄이지 않는다(2026-11-27 헤더, iOS a771057).
 * Figma `UI/지도/다녀온 칸` 하트 있음 3411:31726: 98×50 칸, 이름 x 7 y 5, 하트 x 80 y 3 크기 15.
 */

const CELL_GAP = 3; // map-layer.tsx와 같은 그리기 틈

const NAMES = [
  "꽃잠",
  "노톤&무나니스트",
  "우주먼지",
  "그냥곰 & 무생물제작소",
  "하트쉽 스튜디오",
  "WWW Wonder Works",
  "엘리루카클리너스튜디오",
  "모모(MOMO)",
  "프로젝트 칠",
  "a kind of café",
  "Planet Bear",
  "아주 아주 긴 이름을 가진 브랜드 공동 부스",
];
/** 점유 칸(도면 단위). 가로, 세로, 정사각, 아주 작은 칸까지. */
const CELLS: [number, number][] = [
  [98, 50],
  [104, 56],
  [60, 40],
  [40, 30],
  [30, 20],
  [120, 80],
  [200, 60],
  [50, 50],
  [300, 100],
  [36, 60],
];
/**
 * 웹 지도는 도면 단위로 한 번 그리고 확대는 SVG transform이라 화면 배율은 자리를 바꾸지 않는다. 대신 도면마다 단위가
 * 달라(1단위 = 몇 cm) 같은 칸이 도면 단위로 몇 배가 될 수 있으므로 그 배수를 돌린다.
 */
const UNIT_SCALES = [0.5, 1, 2, 4];

const intersects = (a: Box, b: Box) =>
  a.x < b.x + b.w - 1e-9 && b.x < a.x + a.w - 1e-9 && a.y < b.y + b.h - 1e-9 && b.y < a.y + a.h - 1e-9;

function samples() {
  const out: { name: string; cw: number; ch: number; dw: number; dh: number }[] = [];
  for (const name of NAMES)
    for (const [w, h] of CELLS)
      for (const s of UNIT_SCALES) {
        const cw = w * s;
        const ch = h * s;
        out.push({ name, cw, ch, dw: Math.max(8, cw - CELL_GAP * 2), dh: Math.max(8, ch - CELL_GAP * 2) });
      }
  return out;
}

/** 예전 배치(#238 첫 커밋): 보통 칸 이름표(번호 줄 + 이름)를 왼쪽 위부터 칸 안쪽 폭 전체로 그리고 하트를 얹었다. */
function oldBoxes(name: string, cw: number, ch: number, dw: number, dh: number): Box[] {
  const base = labelBaseUnits(cw, ch);
  const inner = labelInner(cw, ch);
  const l = layoutBoothLabel(name, base, inner.w * NAME_WIDTH, inner.h, true);
  const lineH = l.fontSize * NAME_LINE_HEIGHT;
  const padX = Math.min(dw * 0.08, base * 0.6);
  const padY = Math.min(dh * 0.08, base * 0.5);
  const codeSize = base * CODE_RATIO;
  const left = -dw / 2 + padX;
  const top = -dh / 2 + padY;
  const codeY = top + codeSize;
  const firstY = codeY + lineH * 1.05;
  const code = "A-01";
  return [
    { x: left, y: codeY - codeSize, w: emWidth(code) * codeSize, h: codeSize },
    ...l.lines.map((line, i) => ({
      x: left,
      y: firstY + lineH * i - l.fontSize,
      w: emWidth(line) * l.fontSize,
      h: lineH,
    })),
  ];
}

describe("다녀온 하트 칸 이름 자리", () => {
  it("이름 상자와 하트 상자가 겹치는 칸이 0이다(이름 × 칸 크기 × 단위 배수)", () => {
    const hits: string[] = [];
    for (const s of samples()) {
      const v = placeVisitedHeartName(s.name, s.cw, s.ch, s.dw, s.dh);
      if (nameLineBoxes(v.layout, v.origin).some((r) => intersects(r, v.heart)))
        hits.push(`${s.name} ${s.cw}×${s.ch}`);
    }
    expect(samples().length).toBeGreaterThan(400);
    expect(hits).toEqual([]);
  });

  it("예전 배치를 넣으면 이 검사가 실패한다(겹치는 칸이 있다)", () => {
    let hits = 0;
    for (const s of samples()) {
      const v = placeVisitedHeartName(s.name, s.cw, s.ch, s.dw, s.dh);
      if (oldBoxes(s.name, s.cw, s.ch, s.dw, s.dh).some((r) => intersects(r, v.heart))) hits++;
    }
    expect(hits).toBeGreaterThan(0);
  });

  it("들어가는 칸에서는 하트 때문에 글자를 줄이지 않는다(같은 크기 다른 칸과 같은 글자 크기)", () => {
    let same = 0;
    for (const s of samples()) {
      const base = labelBaseUnits(s.cw, s.ch);
      const inner = labelInner(s.cw, s.ch);
      const plain = layoutBoothLabel(s.name, base, inner.w * NAME_WIDTH, inner.h, false).fontSize;
      const v = placeVisitedHeartName(s.name, s.cw, s.ch, s.dw, s.dh);
      // 하트 왼쪽이나 하트 아래 같은 크기 자리(1, 2단계)가 있으면 크기가 같아야 한다. 커지는 일은 없다.
      expect(v.layout.fontSize).toBeLessThanOrEqual(plain + 1e-9);
      if (Math.abs(v.layout.fontSize - plain) < 1e-9) same++;
    }
    // 대부분의 칸은 같은 크기로 들어간다.
    expect(same / samples().length).toBeGreaterThan(0.8);
  });

  it("Figma 3411:31726(98×50 그리는 칸): 하트 x 80 y 3 크기 15, 이름은 왼쪽 위 하트 왼쪽", () => {
    // 그리는 칸 98×50 = 점유 칸 104×56.
    const v = placeVisitedHeartName("꽃잠", 104, 56, 98, 50);
    expect(v.heart.x + 49).toBeCloseTo(80);
    expect(v.heart.y + 25).toBeCloseTo(3);
    expect(v.heart.w).toBeCloseTo(15);
    // 이름은 왼쪽 위에서 시작(여백 6, Figma 7/5와 1단위 차이).
    expect(v.origin.x + 49).toBeCloseTo(6);
    expect(v.origin.y + 25).toBeCloseTo(6);
    const [line] = nameLineBoxes(v.layout, v.origin);
    expect(line.x + line.w).toBeLessThanOrEqual(v.heart.x);
  });
});
