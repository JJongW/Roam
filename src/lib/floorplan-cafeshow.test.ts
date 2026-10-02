import { describe, it, expect } from "vitest";
import { FLOORPLANS } from "@/lib/floorplans";

// 서울카페쇼 2026 — exporum 배치도 API(exhibitionId 19)에서 변환. 코엑스 전관 두 층.
describe("서울카페쇼 도면", () => {
  const fp = FLOORPLANS["cafeshow-2026"];

  it("두 층 네 홀, 부스 597", () => {
    expect(fp.halls.map((h) => h.name).sort()).toEqual(["Hall A", "Hall B", "Hall C", "Hall D"]);
    expect(fp.booths).toHaveLength(597);
  });

  it("층 이름표가 있다", () => {
    expect(fp.decor.map((d) => ("text" in d ? d.text : "")).filter(Boolean)).toEqual(["1층", "3층"]);
  });

  it("표준부스는 3m(20단위/m → 60)", () => {
    const sizes = new Map<number, number>();
    for (const b of fp.booths) sizes.set(Math.min(b.w, b.h), (sizes.get(Math.min(b.w, b.h)) ?? 0) + 1);
    expect([...sizes.entries()].sort((a, b) => b[1] - a[1])[0][0]).toBe(60);
  });

  it("부스끼리 겹치지 않는다 — 주최 원본의 A111×A107(1m)만 예외", () => {
    const bs = fp.booths;
    const over: string[] = [];
    for (let i = 0; i < bs.length; i++)
      for (let j = i + 1; j < bs.length; j++) {
        const a = bs[i], b = bs[j];
        if (Math.abs(a.x - b.x) * 2 < a.w + b.w - 2 && Math.abs(a.y - b.y) * 2 < a.h + b.h - 2)
          over.push([a.code, b.code].sort().join("×"));
      }
    expect(over).toEqual(["A107×A111"]);
  });
});
