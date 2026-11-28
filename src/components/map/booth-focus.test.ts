import { describe, expect, it } from "vitest";
import { FLOORPLANS, type Floorplan } from "@/lib/floorplans";
import { floorplanHallOf } from "@/lib/floorplan/hall-of";
import { CODE_RATIO, labelBaseUnits } from "./booth-label";
import { boothFocusBox, boothFocusCamera } from "./booth-focus";
import { footprint, worldToScreen } from "./map-camera";
import { READABLE_CODE_PX } from "./map-entry";

// 2026-11-28 운영 버그: 새해 준비상점에서 "들요다"(B66)를 찾아 고르면 홀 전체로 멀어졌다(B66이 화면에서 7x5px).
// 홀이 하나인 도면이면 다 같았다(sdf-2026 D-01 15px, cafeshow-2026 A511 14px).

// 폰(390x844)에서 위 찾기와 칩, 아래 부스 카드를 뺀 띠.
const PHONE = { w: 390, bandTop: 150, bandH: 844 - 150 - 260 };

function camFor(fp: Floorplan, code: string, rotation = 0, currentScale?: number) {
  const cell = fp.booths.find((b) => b.code === code)!;
  return {
    cell,
    cam: boothFocusCamera({
      box: boothFocusBox(cell),
      cell,
      center: { x: cell.x, y: cell.y },
      size: { w: fp.width, h: fp.height },
      rotation,
      view: PHONE,
      currentScale,
      minScale: 0.05,
      maxScale: 12,
    }),
  };
}

/** 그 부스가 있는 홀을 띠에 맞춘 배율(예전 웹의 "부스로 가기"). */
function hallFitScale(fp: Floorplan, code: string, rotation = 0) {
  const name = floorplanHallOf(fp, code);
  const h = fp.halls.find((x) => x.name === name)!;
  const f = footprint({ w: h.w, h: h.h }, rotation);
  return Math.min(PHONE.w / f.fw, PHONE.bandH / f.fh) * 0.92;
}

const CASES: [string, string][] = [
  ["newyear-store-2026", "B66"],
  ["sdf-2026", "D-01"],
  ["cafeshow-2026", "A511"],
];

describe("찾기에서 고른 부스로 다가가기", () => {
  for (const rotation of [0, 90, 33]) {
    for (const [slug, code] of CASES) {
      it(`${slug} ${code}, 지도 ${rotation}도: 부스가 띠 가운데 오고 번호가 읽힌다`, () => {
        const fp = FLOORPLANS[slug];
        const { cell, cam } = camFor(fp, code, rotation);
        const at = worldToScreen({ x: cell.x, y: cell.y }, cam, { w: fp.width, h: fp.height });
        expect(at.x).toBeCloseTo(PHONE.w / 2, 3);
        expect(at.y).toBeCloseTo(PHONE.bandTop + PHONE.bandH / 2, 3);
        const codePx = labelBaseUnits(cell.w, cell.h) * CODE_RATIO * cam.scale;
        expect(codePx).toBeGreaterThanOrEqual(READABLE_CODE_PX - 0.001);
        // 홀 전체 맞춤보다 훨씬 가깝다(회귀: 예전엔 홀 맞춤이었다).
        expect(cam.scale).toBeGreaterThan(hallFitScale(fp, code, rotation) * 3);
      });
    }
  }

  it("돌려 놓인 부스 칸(새해 준비상점 모서리)도 칸 가운데로 간다", () => {
    const fp = FLOORPLANS["newyear-store-2026"];
    const rotated = fp.booths.find((b) => b.rotate);
    expect(rotated).toBeDefined();
    const { cell, cam } = camFor(fp, rotated!.code);
    const at = worldToScreen({ x: cell.x, y: cell.y }, cam, { w: fp.width, h: fp.height });
    expect(at.x).toBeCloseTo(PHONE.w / 2, 3);
    expect(at.y).toBeCloseTo(PHONE.bandTop + PHONE.bandH / 2, 3);
  });

  it("부스 칸이 띠보다 크면 칸이 다 들어가는 데서 멈춘다", () => {
    const fp = FLOORPLANS["newyear-store-2026"];
    const big = [...fp.booths].sort((a, b) => b.w * b.h - a.w * a.h)[0];
    const { cam } = camFor(fp, big.code);
    expect(big.w * cam.scale).toBeLessThanOrEqual(PHONE.w);
    expect(big.h * cam.scale).toBeLessThanOrEqual(PHONE.bandH);
  });

  it("이미 더 가까이 보고 있으면 배율은 두고 가운데만 옮긴다(iOS keepScaleIfCloser)", () => {
    const fp = FLOORPLANS["newyear-store-2026"];
    const base = camFor(fp, "B66").cam.scale;
    expect(camFor(fp, "B66", 0, base * 2).cam.scale).toBeCloseTo(base * 2, 6);
    expect(camFor(fp, "B66", 0, base / 2).cam.scale).toBeCloseTo(base, 6);
  });

  it("이웃을 담는 상자는 iOS와 같다(좌우 칸 폭 2배, 위아래 칸 높이 3배)", () => {
    expect(boothFocusBox({ x: 100, y: 100, w: 40, h: 30 })).toEqual({ x: 0, y: -5, w: 200, h: 210 });
  });
});
