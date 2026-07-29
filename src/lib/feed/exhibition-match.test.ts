import { describe, expect, it } from "vitest";
import {
  byStartDate,
  exhibitionValueProfile,
  matchExhibition,
  matchReason,
} from "./exhibition-match";
import { emptyBrain } from "@/lib/memory/distill";
import type { Booth, UserBrain } from "@/lib/types";

function booth(
  id: string,
  valueTags: Array<[string, number]>,
  kind: Booth["kind"] = "exhibitor",
): Booth {
  return {
    id,
    exhibitionId: "e",
    hallId: "h",
    categoryId: "c",
    kind,
    name: id,
    company: "",
    description: "",
    longDescription: "",
    images: [],
    tags: [],
    valueTags: valueTags.map(([slug, strength]) => ({ slug, strength })),
    x: 0,
    y: 0,
    popularity: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

function brainWith(interests: Array<[string, number]>): UserBrain {
  return {
    ...emptyBrain("u", "2026-01-01T00:00:00.000Z"),
    interests: interests.map(([key, confidence]) => ({
      key,
      label: key,
      confidence,
      signals: { explicit: 1, implicit: 0, negative: 0 },
      firstSeenAt: "2026-01-01T00:00:00.000Z",
      lastSeenAt: "2026-01-01T00:00:00.000Z",
      trend: "flat" as const,
    })),
  };
}

describe("exhibitionValueProfile", () => {
  it("normalises booth value tags into shares summing to 1", () => {
    const p = exhibitionValueProfile([
      booth("a", [["goods", 1]]),
      booth("b", [["social", 1]]),
    ]);
    expect(p.goods).toBeCloseTo(0.5);
    expect(p.social).toBeCloseTo(0.5);
    expect(Object.values(p).reduce((s, v) => s + v, 0)).toBeCloseTo(1);
  });

  it("excludes facilities — they are not part of the visiting taste", () => {
    const p = exhibitionValueProfile([
      booth("a", [["goods", 1]]),
      booth("centre", [["social", 9]], "facility"),
    ]);
    expect(p.social).toBeUndefined();
    expect(p.goods).toBeCloseTo(1);
  });

  it("returns an empty profile when there is nothing to derive from", () => {
    expect(exhibitionValueProfile([])).toEqual({});
    expect(exhibitionValueProfile([booth("a", [])])).toEqual({});
  });
});

describe("matchExhibition", () => {
  const profile = exhibitionValueProfile([
    booth("a", [["goods", 1]]),
    booth("b", [["goods", 1]]),
    booth("c", [["social", 1]]),
    booth("d", [["rest", 1]]),
  ]);

  it("matches only values the exhibition actually has", () => {
    const m = matchExhibition(brainWith([["goods", 0.8]]), profile);
    expect(m.matched).toEqual(["goods"]);
    expect(m.score).toBeGreaterThan(0);
  });

  it("orders matched values by strength of the overlap", () => {
    const m = matchExhibition(
      brainWith([
        ["social", 0.4],
        ["goods", 0.9],
      ]),
      profile,
    );
    expect(m.matched[0]).toBe("goods");
  });

  // 근거 없는 추천을 막는 핵심 경로 — 겹침이 없으면 추천이라 부르면 안 된다.
  it("returns no match when the user's interests are absent from the exhibition", () => {
    const m = matchExhibition(brainWith([["learning", 0.9]]), profile);
    expect(m).toEqual({ score: 0, matched: [] });
  });

  it("returns no match without a brain", () => {
    expect(matchExhibition(null, profile)).toEqual({ score: 0, matched: [] });
  });

  it("ignores interests below the confidence floor", () => {
    expect(matchExhibition(brainWith([["goods", 0.05]]), profile).matched).toEqual([]);
  });

  it("ignores values that are a negligible part of the exhibition", () => {
    const lopsided = exhibitionValueProfile([
      booth("a", [["goods", 100]]),
      booth("b", [["rest", 1]]),
    ]);
    expect(matchExhibition(brainWith([["rest", 0.9]]), lopsided).matched).toEqual([]);
  });
});

describe("matchReason", () => {
  it("names the overlapping values", () => {
    const r = matchReason(["goods", "social"]);
    expect(r).toContain("겹치는 부스가 많아");
    expect(r).not.toContain("undefined");
  });

  it("says nothing when nothing overlaps", () => {
    expect(matchReason([])).toBeNull();
  });

  it("keeps the sentence short by capping the values it names", () => {
    const r = matchReason(["goods", "social", "rest", "discovery"])!;
    expect(r.split("·").length).toBeLessThanOrEqual(2);
  });
});

describe("byStartDate", () => {
  it("orders soonest first and does not mutate the input", () => {
    const list = [
      { startDate: "2026-08-13" },
      { startDate: "2026-07-30" },
    ];
    expect(byStartDate(list).map((e) => e.startDate)).toEqual([
      "2026-07-30",
      "2026-08-13",
    ]);
    expect(list[0].startDate).toBe("2026-08-13");
  });
});
