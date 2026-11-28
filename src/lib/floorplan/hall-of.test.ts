import { describe, expect, it } from "vitest";
import { FLOORPLANS } from "@/lib/floorplans";
import { boothHallLabel, floorplanHallOf, hallForBooth, shortHallName } from "./hall-of";

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

// 2026-11-29 헤더: 부스 카드와 상세의 위치 줄이 "킨텍스 제2전시장 6홀 A01"처럼 홀 이름을 통째로 적었다.
// iOS(FairMapViewModel.hallName(of:) → MapHall.shortName)처럼 홀 칩과 같은 짧은 이름으로 맞춘다.
describe("부스 카드와 상세의 홀 칸", () => {
  it("실제 배치도 홀 이름을 iOS와 같이 줄인다", () => {
    expect(boothHallLabel(FLOORPLANS["newyear-store-2026"], "A01")).toBe("6홀");
    expect(boothHallLabel(FLOORPLANS["sdf-2026"], "A-01")).toBe("A홀");
    expect(boothHallLabel(FLOORPLANS["sif-2026"], "A01")).toBe("C홀");
    expect(boothHallLabel(FLOORPLANS["cafeshow-2026"], "A511")).toBe("A홀");
    expect(boothHallLabel(FLOORPLANS["ddp-designfair-2026"], "E17")).toBe("아트홀");
    expect(boothHallLabel(FLOORPLANS["seoul-furniture-show-2026"], "A210")).toBe("SETEC");
  });

  it("배치도에서 못 찾으면 부스 데이터의 홀 이름을 같은 규칙으로 줄인다", () => {
    expect(boothHallLabel(FLOORPLANS["newyear-store-2026"], "없는칸", "킨텍스 제2전시장 6홀")).toBe("6홀");
    expect(boothHallLabel(undefined, "A01", "Hall B")).toBe("B홀");
    expect(boothHallLabel(undefined, "A01", "  ")).toBeUndefined();
    expect(boothHallLabel(undefined, "A01")).toBeUndefined();
  });
});
