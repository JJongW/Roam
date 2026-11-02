import { describe, expect, it } from "vitest";
import { pressScale } from "@/lib/press-scale";

/** 배율이 아니라 거리가 고정되는지 — 이 성질이 깨지면 공식이 틀린 것이다. */
function travel(width: number, height: number): number {
  const basis = Math.max(height, width / 4, 24);
  return basis * (1 - pressScale(width, height));
}

describe("pressScale", () => {
  it("크기가 달라도 움직이는 거리가 2px로 같다", () => {
    const boxes: [number, number][] = [
      [70, 32], // Chip sm
      [120, 44], // Button default
      [370, 44], // 전체폭 CTA — 폭 보정이 걸리는 경우
      [200, 52], // Button lg
      [370, 300], // 전시 카드
    ];
    for (const [w, h] of boxes) {
      expect(travel(w, h)).toBeCloseTo(2, 10);
    }
  });

  it("가로로 긴 요소는 폭 ÷ 4가 기준이 된다", () => {
    // 370×44 → 높이 44보다 370÷4=92.5가 크다
    expect(pressScale(370, 44)).toBeCloseTo((92.5 - 2) / 92.5, 10);
    // 120×44 → 120÷4=30 < 44 이므로 높이가 기준
    expect(pressScale(120, 44)).toBeCloseTo((44 - 2) / 44, 10);
  });

  it("작은 요소는 최소 24에 걸려 8.3%보다 더 줄지 않는다", () => {
    expect(pressScale(10, 10)).toBeCloseTo((24 - 2) / 24, 10);
    expect(1 - pressScale(10, 10)).toBeLessThanOrEqual(2 / 24 + 1e-12);
  });

  it("고정 배율보다 큰 요소는 덜, 작은 요소는 더 줄인다", () => {
    expect(pressScale(70, 32)).toBeLessThan(0.98); // 칩은 더 줄여야 2px
    expect(pressScale(370, 300)).toBeGreaterThan(0.99); // 카드는 덜 줄여야 2px
  });
});
