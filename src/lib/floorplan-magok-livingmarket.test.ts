import { describe, it, expect } from "vitest";
import { FLOORPLANS, VENUE_OF } from "@/lib/floorplans";
describe("마곡리빙마켓 도면", () => {
  const fp = FLOORPLANS["magok-livingmarket-2026"];
  it("부스 138 + 시설 4가 합성된다", () => {
    expect(fp.booths).toHaveLength(142);
  });
  it("홀 벽이 그려진다(hallOrigin 등록됨)", () => {
    expect(fp.halls).toHaveLength(1);
    expect(fp.halls[0].w).toBe(108 * 20);
    expect(fp.halls[0].h).toBe(69 * 20);
  });
  it("venue의 출입구를 물려받는다", () => {
    expect(VENUE_OF["magok-livingmarket-2026"].id).toBe("coex-magok-1f");
    expect(fp.gates?.length).toBe(4);
  });
  it("모든 부스가 홀 안에 있다", () => {
    const h = fp.halls[0];
    for (const b of fp.booths) {
      expect(b.x - b.w / 2).toBeGreaterThanOrEqual(h.x - 1);
      expect(b.x + b.w / 2).toBeLessThanOrEqual(h.x + h.w + 1);
      expect(b.y - b.h / 2).toBeGreaterThanOrEqual(h.y - 1);
      expect(b.y + b.h / 2).toBeLessThanOrEqual(h.y + h.h + 1);
    }
  });
  it("모든 부스가 1.5m 반모듈 배수이고 표준부스보다 작지 않다", () => {
    const U = 20, HALF = 1.5 * U, STD = 3 * U;
    // 시설(가든라운지·큐레이션 띠)은 표준부스 규격을 따르지 않는다.
    const exhibitor = fp.booths.filter((b) => b.color !== "#aeb4bf");
    expect(exhibitor).toHaveLength(138);
    const odd = exhibitor.filter(
      (b) => b.w % HALF !== 0 || b.h % HALF !== 0 || b.w < STD || b.h < STD,
    );
    expect(odd.map((b) => `${b.code} ${b.w / U}×${b.h / U}m`)).toEqual([]);
  });

  it("부스 크기 종류가 손에 꼽는다", () => {
    const sizes = new Set(fp.booths.map((b) => `${b.w}×${b.h}`));
    expect(sizes.size).toBeLessThanOrEqual(24);
  });

  it("부스끼리 겹치지 않는다", () => {
    const bs = fp.booths;
    const over: string[] = [];
    for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) {
      const a = bs[i], b = bs[j];
      if (Math.abs(a.x - b.x) * 2 < a.w + b.w - 2 && Math.abs(a.y - b.y) * 2 < a.h + b.h - 2)
        over.push(`${a.code}×${b.code}`);
    }
    expect(over).toEqual([]);
  });
});
