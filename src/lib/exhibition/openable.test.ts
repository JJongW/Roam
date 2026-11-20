import { describe, expect, it } from "vitest";
import { availabilityOf, isBoothPlaced, isFairOpen, openFields } from "./openable";

describe("박람회 열림 기준(2026-11-20)", () => {
  it("좌표가 0,0이 아닌 참가 부스가 한 곳이라도 있으면 열린다", () => {
    expect(isFairOpen([{ x: 0, y: 0 }, { x: 120, y: 40 }])).toBe(true);
  });

  it("부스가 없거나(브랜드 먼저 인입) 전부 0,0이면 닫혀 있다", () => {
    expect(isFairOpen([])).toBe(false);
    expect(isFairOpen([{ x: 0, y: 0 }, { x: 0, y: 0 }])).toBe(false);
  });

  it("편의시설만 놓인 박람회는 열지 않는다", () => {
    expect(isBoothPlaced({ x: 10, y: 10, kind: "facility" })).toBe(false);
    expect(isFairOpen([{ x: 10, y: 10, kind: "facility" }])).toBe(false);
    expect(isBoothPlaced({ x: 10, y: 10, kind: null })).toBe(true);
  });

  it("API 칸: openable과 availability", () => {
    expect(availabilityOf(false)).toBe("upcoming_no_map");
    expect(openFields(true)).toEqual({ openable: true, availability: "open" });
    expect(openFields(false)).toEqual({ openable: false, availability: "upcoming_no_map" });
  });
});
