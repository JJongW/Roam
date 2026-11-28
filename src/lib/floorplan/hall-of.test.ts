import { describe, expect, it } from "vitest";
import { FLOORPLANS } from "@/lib/floorplans";
import { floorplanHallOf, hallForBooth, shortHallName } from "./hall-of";

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

// 2026-11-28 헤더: 홀 칩이 "Hall A"를 앞 세 글자 "Hal"로 잘랐다. iOS FairMapModelTests와 같은 사례.
describe("홀 칩 짧은 이름", () => {
  it("홀을 가르는 표지만 남긴다", () => {
    expect(shortHallName("Hall A")).toBe("A홀");
    expect(shortHallName("Hall B1")).toBe("B1홀");
    expect(shortHallName("코엑스 C홀")).toBe("C홀");
    expect(shortHallName("킨텍스 제2전시장 6홀")).toBe("6홀");
    expect(shortHallName("DDP 아트홀")).toBe("아트홀");
    expect(shortHallName("SETEC")).toBe("SETEC");
  });

  it("번들 도면 홀은 앞 세 글자로 잘리지 않는다", () => {
    for (const fp of Object.values(FLOORPLANS)) {
      for (const h of fp.halls) expect(shortHallName(h.name)).not.toMatch(/^Hal$/);
    }
    expect(FLOORPLANS["cafeshow-2026"].halls.map((h) => shortHallName(h.name)).sort()).toEqual(["A홀", "B홀", "C홀", "D홀"]);
  });
});
