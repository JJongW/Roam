import { describe, it, expect } from "vitest";
import { FLOORPLANS } from "@/lib/floorplans";

// 서울카페쇼 2026 — exporum 배치도 API(exhibitionId 19)에서 변환. 코엑스 전관 두 층.
// 2026-11-17 최신 배치도로 다시 뽑았다(597 → 615, `scripts/floorplan-from-exporum.mjs`).
describe("서울카페쇼 도면", () => {
  const fp = FLOORPLANS["cafeshow-2026"];

  it("두 층 네 홀, 부스 615", () => {
    expect(fp.halls.map((h) => h.name).sort()).toEqual(["Hall A", "Hall B", "Hall C", "Hall D"]);
    expect(fp.booths).toHaveLength(615);
  });

  it("층 이름표가 있다", () => {
    expect(fp.decor.map((d) => ("text" in d ? d.text : "")).filter(Boolean)).toEqual(["1층", "3층"]);
  });

  it("표준부스는 3m(20단위/m → 60)", () => {
    const sizes = new Map<number, number>();
    for (const b of fp.booths) sizes.set(Math.min(b.w, b.h), (sizes.get(Math.min(b.w, b.h)) ?? 0) + 1);
    expect([...sizes.entries()].sort((a, b) => b[1] - a[1])[0][0]).toBe(60);
  });

  it("부스끼리 겹치지 않는다 — ㄱ자 부스는 변환 스크립트가 배치도대로 자른다", () => {
    // 옛 예외 A111×A107은 주최가 고쳐서 없어졌다. API가 감싸는 네모로 주는 ㄱ자 부스
    // (A919, A119, A841)는 `RECT_OVERRIDES`가 잘라서, 이제 예외 없이 0쌍이다.
    const bs = fp.booths;
    const over: string[] = [];
    for (let i = 0; i < bs.length; i++)
      for (let j = i + 1; j < bs.length; j++) {
        const a = bs[i], b = bs[j];
        if (Math.abs(a.x - b.x) * 2 < a.w + b.w - 2 && Math.abs(a.y - b.y) * 2 < a.h + b.h - 2)
          over.push([a.code, b.code].sort().join("×"));
      }
    expect(over).toEqual([]);
  });

  it("ㄱ자 부스는 배치도대로 잘려 있다", () => {
    const byCode = new Map(fp.booths.map((b) => [b.code, b]));
    expect(byCode.get("A919")?.h).toBe(220); // 12m → 11m
    expect(byCode.get("A119")?.h).toBe(220);
    expect(byCode.get("A841")?.w).toBe(60); // 6m → 오른쪽 3m
  });
});
