import { describe, expect, it } from "vitest";
import { bearing, nextInstruction, offRoute } from "./navigation";
import type { Booth } from "@/lib/types";

function booth(x: number, y: number): Booth {
  return {
    id: "b",
    exhibitionId: "e",
    hallId: "h",
    categoryId: "c",
    name: "Target",
    company: "",
    description: "",
    longDescription: "",
    images: [],
    tags: [],
    x,
    y,
    popularity: 0,
    createdAt: "",
  };
}

describe("bearing", () => {
  it("points up for a target directly above", () => {
    expect(bearing({ x: 0, y: 100 }, { x: 0, y: 0 })).toBeCloseTo(0, 1);
  });
  it("points right (90) for a target to the right", () => {
    expect(bearing({ x: 0, y: 0 }, { x: 100, y: 0 })).toBeCloseTo(90, 1);
  });
});

describe("nextInstruction", () => {
  it("announces arrival within threshold", () => {
    const i = nextInstruction({ x: 0, y: 0 }, booth(10, 10), 60);
    expect(i.direction).toBe("arrive");
    expect(i.text).toContain("도착");
  });

  it("reports distance in meters", () => {
    const i = nextInstruction({ x: 0, y: 0 }, booth(0, 1000));
    expect(i.meters).toBe(100); // 1000 units / 10 = 100m
  });

  it("computes a relative turn from the heading", () => {
    // facing up (0), target to the right → turn right
    const i = nextInstruction({ x: 0, y: 0 }, booth(100, 0), 60, 0);
    expect(i.direction).toBe("right");
  });
});

describe("offRoute", () => {
  it("is false with no next booth", () => {
    expect(offRoute({ x: 0, y: 0 }, undefined)).toBe(false);
  });
  it("flags large deviation", () => {
    expect(offRoute({ x: 0, y: 0 }, booth(1000, 1000), 250)).toBe(true);
  });
});
