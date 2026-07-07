import { describe, expect, it } from "vitest";
import { assessFatigue } from "./reasoner";

describe("assessFatigue", () => {
  it("방문·경과 없으면 0", () => {
    expect(
      assessFatigue({ boothsVisited: 0, plannedStops: 10, elapsedMinutes: 0, budgetMinutes: 60 }),
    ).toBe(0);
  });

  it("다 보고 예산 다 쓰면 1", () => {
    expect(
      assessFatigue({ boothsVisited: 10, plannedStops: 10, elapsedMinutes: 60, budgetMinutes: 60 }),
    ).toBe(1);
  });

  it("절반이면 0.5", () => {
    expect(
      assessFatigue({ boothsVisited: 5, plannedStops: 10, elapsedMinutes: 30, budgetMinutes: 60 }),
    ).toBeCloseTo(0.5, 5);
  });

  it("방문·경과 오를수록 단조 증가", () => {
    const low = assessFatigue({ boothsVisited: 2, plannedStops: 10, elapsedMinutes: 10, budgetMinutes: 60 });
    const high = assessFatigue({ boothsVisited: 8, plannedStops: 10, elapsedMinutes: 50, budgetMinutes: 60 });
    expect(high).toBeGreaterThan(low);
  });

  it("초과해도 1로 클램프", () => {
    expect(
      assessFatigue({ boothsVisited: 20, plannedStops: 10, elapsedMinutes: 120, budgetMinutes: 60 }),
    ).toBe(1);
  });

  it("0 분모 안전(0)", () => {
    expect(
      assessFatigue({ boothsVisited: 0, plannedStops: 0, elapsedMinutes: 0, budgetMinutes: 0 }),
    ).toBe(0);
  });
});
