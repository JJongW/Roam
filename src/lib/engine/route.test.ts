import { describe, expect, it } from "vitest";
import { isDeviated, planRoute, recomputeRoute } from "./route";
import type { Booth, ScoredBooth } from "@/lib/types";

function scored(id: string, x: number, y: number, score: number): ScoredBooth {
  const booth: Booth = {
    id,
    exhibitionId: "e1",
    hallId: "h1",
    categoryId: "c1",
    name: id,
    company: "Co",
    description: "",
    longDescription: "",
    images: [],
    tags: [],
    x,
    y,
    popularity: 50,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
  return {
    booth,
    score,
    breakdown: { interest: 0, popularity: 0, event: 0 },
  };
}

describe("planRoute", () => {
  const ranked = [
    scored("a", 0, 0, 1.0),
    scored("b", 100, 0, 0.9),
    scored("c", 1000, 1000, 0.8),
  ];

  it("includes high-priority nearby booths first", () => {
    const plan = planRoute(ranked, {
      movementPreference: "balanced",
      availableMinutes: 240,
      start: { x: 0, y: 0 },
    });
    expect(plan.boothIds[0]).toBe("a");
    expect(plan.boothIds.length).toBeGreaterThan(0);
  });

  it("respects the time budget", () => {
    const plan = planRoute(ranked, {
      movementPreference: "balanced",
      availableMinutes: 20,
      start: { x: 0, y: 0 },
    });
    expect(plan.estimatedMinutes).toBeLessThanOrEqual(60);
  });

  it("shortest preference visits fewer or equal stops than thorough", () => {
    const short = planRoute(ranked, {
      movementPreference: "shortest",
      availableMinutes: 600,
      start: { x: 0, y: 0 },
    });
    const thorough = planRoute(ranked, {
      movementPreference: "thorough",
      availableMinutes: 600,
      start: { x: 0, y: 0 },
    });
    expect(short.boothIds.length).toBeLessThanOrEqual(thorough.boothIds.length);
  });

  it("adds per-booth dwell time to the estimate", () => {
    const plain = planRoute(ranked, {
      movementPreference: "thorough",
      availableMinutes: 600,
      start: { x: 0, y: 0 },
    });
    const withDwell = ranked.map((s) => ({
      ...s,
      booth: { ...s.booth, dwellMinutes: 10 },
    }));
    const dwelled = planRoute(withDwell, {
      movementPreference: "thorough",
      availableMinutes: 600,
      start: { x: 0, y: 0 },
    });
    // same stops, but dwell (10) > fallback BASE_DWELL (5) → larger estimate.
    expect(dwelled.boothIds).toEqual(plain.boothIds);
    expect(dwelled.estimatedMinutes).toBeGreaterThan(plain.estimatedMinutes);
  });

  it("produces legs that connect sequentially", () => {
    const plan = planRoute(ranked, {
      movementPreference: "balanced",
      availableMinutes: 600,
      start: { x: 0, y: 0 },
    });
    expect(plan.legs[0].from).toBe("start");
    for (let i = 1; i < plan.legs.length; i++) {
      expect(plan.legs[i].from).toBe(plan.legs[i - 1].to);
    }
  });
});

describe("recomputeRoute", () => {
  it("keeps visited booths and replans the rest", () => {
    const ranked = [
      scored("a", 0, 0, 1),
      scored("b", 50, 0, 0.9),
      scored("c", 100, 0, 0.8),
    ];
    const result = recomputeRoute(
      ranked,
      ["a"],
      { x: 0, y: 0 },
      { movementPreference: "balanced", availableMinutes: 240 },
    );
    expect(result.boothIds[0]).toBe("a");
    expect(result.boothIds.filter((x) => x === "a").length).toBe(1); // visited booth kept once
    expect(result.boothIds).toContain("b");
  });
});

describe("isDeviated", () => {
  const next: Booth = scored("a", 0, 0, 1).booth;
  it("flags when far from next booth", () => {
    expect(isDeviated({ x: 1000, y: 1000 }, next, 250)).toBe(true);
  });
  it("does not flag when close", () => {
    expect(isDeviated({ x: 10, y: 10 }, next, 250)).toBe(false);
  });
});
