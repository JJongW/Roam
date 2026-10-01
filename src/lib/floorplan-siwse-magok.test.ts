import { describe, it, expect } from "vitest";
import { FLOORPLANS, VENUE_OF } from "@/lib/floorplans";

// 2026 서울국제주류&와인박람회 마곡 — 주최 벡터 PDF(magok_boot_2026_kr.pdf)에서 뽑았다.
// 축척은 표준부스 한 칸(97.5px) = 3m, 위치는 PDF 출입구 두 쌍을 venue 문에 맞췄다.
describe("서울국제주류&와인박람회 마곡 도면", () => {
  const fp = FLOORPLANS["siwse-magok-2026"];

  it("참가 186 + 시설 8이 합성된다", () => {
    expect(fp.booths).toHaveLength(194);
  });

  it("마곡리빙마켓과 같은 장소를 쓴다", () => {
    expect(VENUE_OF["siwse-magok-2026"].id).toBe("coex-magok-1f");
    expect(fp.halls).toHaveLength(1);
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

  it("부스끼리 겹치지 않는다", () => {
    const bs = fp.booths;
    const over: string[] = [];
    for (let i = 0; i < bs.length; i++)
      for (let j = i + 1; j < bs.length; j++) {
        const a = bs[i], b = bs[j];
        if (Math.abs(a.x - b.x) * 2 < a.w + b.w - 2 && Math.abs(a.y - b.y) * 2 < a.h + b.h - 2)
          over.push(`${a.code}×${b.code}`);
      }
    expect(over).toEqual([]);
  });

  // 벡터 원본이라 격자에 맞추지 않고 실측값을 쓴다. 대신 표준부스 한 칸이
  // 3m로 떨어지는지로 축척을 검증한다(마곡 venue 표준부스 3×3m).
  it("1×1 참가 부스가 3m 칸이다(축척 검증)", () => {
    const U = 20;
    const unit = fp.booths.filter((b) => b.color !== "#aeb4bf" && b.w < 4 * U && b.h < 4 * U);
    expect(unit.length).toBeGreaterThan(150);
    for (const b of unit) {
      expect(Math.abs(b.w / U - 3)).toBeLessThan(0.15);
      expect(Math.abs(b.h / U - 3)).toBeLessThan(0.15);
    }
  });
});
