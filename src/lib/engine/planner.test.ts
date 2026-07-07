import { describe, expect, it } from "vitest";
import type { Booth, ScoredBooth } from "@/lib/types";
import { replanRemaining } from "./planner";

function booth(id: string, x: number): Booth {
  return {
    id,
    code: id,
    exhibitionId: "e",
    hallId: "h",
    categoryId: "c",
    name: id,
    company: id,
    kind: "exhibitor",
    description: "",
    longDescription: "",
    images: [],
    tags: [],
    x,
    y: 0,
    dwellMinutes: 5,
    popularity: 50,
    createdAt: "2026-01-01T00:00:00Z",
  } as Booth;
}

// 원점에서 x축을 따라 퍼진 8개 부스, 점수 내림차순.
const ranked: ScoredBooth[] = Array.from({ length: 8 }, (_, i) => ({
  booth: booth(`b${i}`, i * 300),
  score: 1 - i * 0.05,
  breakdown: { interest: 0, popularity: 0, event: 0 },
}));

const base = {
  ranked,
  visitedBoothIds: ["b0"],
  current: { x: 0, y: 0 },
  movementPreference: "balanced" as const,
  budgetMinutes: 30,
};

function remainingCount(r: { boothIds: string[] }, visited: string[]) {
  return r.boothIds.filter((id) => !visited.includes(id)).length;
}

describe("replanRemaining", () => {
  it("방문 부스는 유지(선두)·중복 없음, 나머지는 재계획", () => {
    const r = replanRemaining({ ...base, elapsedMinutes: 5, fatigue: 0 });
    expect(r.boothIds[0]).toBe("b0"); // 방문 유지(선두)
    expect(r.boothIds.filter((id) => id === "b0")).toHaveLength(1); // 중복 아님
  });

  it("경과 많을수록 남은 부스 수 감소", () => {
    const early = replanRemaining({ ...base, elapsedMinutes: 2, fatigue: 0 });
    const late = replanRemaining({ ...base, elapsedMinutes: 25, fatigue: 0 });
    expect(remainingCount(late, base.visitedBoothIds)).toBeLessThanOrEqual(
      remainingCount(early, base.visitedBoothIds),
    );
    expect(remainingCount(early, base.visitedBoothIds)).toBeGreaterThan(0);
  });

  it("피로 높을수록 남은 부스 수 감소", () => {
    const rested = replanRemaining({ ...base, elapsedMinutes: 8, fatigue: 0 });
    const tired = replanRemaining({ ...base, elapsedMinutes: 8, fatigue: 1 });
    expect(remainingCount(tired, base.visitedBoothIds)).toBeLessThanOrEqual(
      remainingCount(rested, base.visitedBoothIds),
    );
  });

  it("예산 소진 시 남은 부스는 최대 1(엔진이 마지막 한 곳은 보장)", () => {
    const r = replanRemaining({ ...base, elapsedMinutes: 30, fatigue: 0 });
    expect(remainingCount(r, base.visitedBoothIds)).toBeLessThanOrEqual(1);
  });
});
