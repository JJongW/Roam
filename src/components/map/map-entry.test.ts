import { describe, expect, it } from "vitest";
import { FLOORPLANS } from "@/lib/floorplans";
import { CODE_RATIO } from "./booth-label";
import {
  clampAxis,
  entryPoint,
  labelBase,
  medianLabelBase,
  READABLE_CODE_PX,
  readableScale,
} from "./map-entry";

// iOS `MapEntryTests`와 같은 사례.
describe("지도 진입 배율·자리", () => {
  it("부스 글자 크기는 짧은 변의 1/5.5, 7~26 사이다", () => {
    expect(labelBase(110, 55)).toBe(10);
    expect(labelBase(20, 20)).toBe(7);
    expect(labelBase(400, 400)).toBe(26);
  });

  it("가장 작은 칸 하나에 끌려가지 않는다 — 가운데값 기준", () => {
    const sizes = [{ w: 20, h: 20 }, ...Array(4).fill({ w: 55, h: 55 }), { w: 900, h: 900 }];
    expect(medianLabelBase(sizes)).toBe(10);
  });

  it("이미 읽히는 도면은 맞춤 배율 아래로 줄이지 않는다", () => {
    expect(readableScale([{ w: 400, h: 400 }], 2)).toBe(2);
  });

  it("번들 도면 전부, 진입 화면에서 보통 부스의 코드가 11px 이상이다", () => {
    for (const [slug, fp] of Object.entries(FLOORPLANS)) {
      if (!fp || fp.booths.length === 0) continue;
      const s = readableScale(fp.booths, 0.1);
      const code = (medianLabelBase(fp.booths) ?? 0) * CODE_RATIO * s;
      expect(code, slug).toBeGreaterThanOrEqual(READABLE_CODE_PX - 0.001);
    }
  });

  it("입구를 보며 들어온다 — 이름 붙은 입구가 먼저", () => {
    for (const fp of Object.values(FLOORPLANS)) {
      if (!fp) continue;
      const gate = fp.gates?.find((g) => g.kind === "in");
      if (gate) expect(entryPoint(fp)).toEqual({ x: gate.x, y: gate.y });
    }
  });

  it("가장자리를 비춰도 도면 밖을 비추지 않고, 아래 띠만큼은 올라온다", () => {
    expect(clampAxis(500, 800, 3000)).toBe(0);
    expect(clampAxis(-99999, 800, 3000)).toBe(-2200);
    expect(clampAxis(-99999, 800, 3000, 240)).toBe(-2440);
    expect(clampAxis(50, 800, 100)).toBe(350);
  });
});
