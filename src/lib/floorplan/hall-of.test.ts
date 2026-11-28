import { describe, expect, it } from "vitest";
import { FLOORPLANS } from "@/lib/floorplans";
import { floorplanHallOf, hallForBooth } from "./hall-of";

// 2026-11-28 헤더: 여러 홀 도면에서 찾아 고르면 홀 칩이 "전체"로 남았다. iOS처럼 그 홀로 바꾼다.
describe("부스로 갈 때 홀 칩", () => {
  it("여러 홀 도면(카페쇼)이면 그 부스가 있는 홀로 바꾼다", () => {
    const fp = FLOORPLANS["cafeshow-2026"];
    const hall = floorplanHallOf(fp, "A511");
    expect(hall).toBe("Hall A");
    expect(hallForBooth(fp, "A511", null)).toBe("Hall A");
    expect(hallForBooth(fp, "A511", "Hall B")).toBe("Hall A");
  });

  it("홀이 하나인 도면(새해 준비상점)이면 칩을 건드리지 않는다", () => {
    expect(hallForBooth(FLOORPLANS["newyear-store-2026"], "B66", null)).toBeNull();
  });

  it("칸을 모르면 지금 고른 홀을 그대로 둔다", () => {
    expect(hallForBooth(FLOORPLANS["cafeshow-2026"], "없는칸", "Hall B")).toBe("Hall B");
    expect(hallForBooth(undefined, "A511", null)).toBeNull();
  });
});
