import { describe, expect, it } from "vitest";
import {
  interestScore,
  rankBooths,
  scoreBooth,
  eventBoost,
  distance,
} from "./scoring";
import type { Booth, BoothEvent, UserPreference } from "@/lib/types";

function booth(p: Partial<Booth>): Booth {
  return {
    id: "b1",
    exhibitionId: "e1",
    hallId: "h1",
    categoryId: "c1",
    name: "B",
    company: "Co",
    description: "",
    longDescription: "",
    images: [],
    tags: ["ai"],
    x: 0,
    y: 0,
    popularity: 50,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...p,
  };
}

const pref: Pick<
  UserPreference,
  "visitPurposes" | "interests" | "availableMinutes" | "companionType"
> = {
  visitPurposes: ["information"],
  interests: ["ai"],
  availableMinutes: 120,
  companionType: "alone",
};

describe("distance", () => {
  it("computes euclidean distance", () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });
});

describe("interestScore", () => {
  it("is 0 when no interests selected", () => {
    expect(interestScore(booth({ tags: ["ai"] }), [])).toBe(0);
  });
  it("is 0 when no tag overlap", () => {
    expect(interestScore(booth({ tags: ["food"] }), ["ai"])).toBe(0);
  });
  it("rewards overlap", () => {
    expect(interestScore(booth({ tags: ["ai"] }), ["ai"])).toBeGreaterThan(0.5);
  });
});

describe("eventBoost", () => {
  const now = Date.parse("2026-06-10T10:00:00+09:00");
  const within: BoothEvent = {
    id: "ev",
    boothId: "b1",
    title: "",
    description: "",
    startTime: "2026-06-10T10:30:00+09:00",
    endTime: "2026-06-10T11:00:00+09:00",
  };
  it("boosts events within the window", () => {
    expect(eventBoost([within], now, 120)).toBe(1);
  });
  it("returns 0 with no events", () => {
    expect(eventBoost([], now, 120)).toBe(0);
  });
});

describe("scoreBooth + rankBooths", () => {
  const ctx = {
    preference: pref,
    eventsByBooth: {},
    now: Date.parse("2026-06-10T10:00:00+09:00"),
  };

  it("scores a matching booth higher than a non-matching one", () => {
    const match = scoreBooth(
      booth({ id: "m", tags: ["ai"], popularity: 50 }),
      ctx,
    );
    const miss = scoreBooth(
      booth({ id: "x", tags: ["food"], popularity: 50 }),
      ctx,
    );
    expect(match.score).toBeGreaterThan(miss.score);
  });

  it("ranks deterministically (desc by score, tie by id)", () => {
    const ranked = rankBooths(
      [booth({ id: "b", tags: ["food"] }), booth({ id: "a", tags: ["ai"] })],
      ctx,
    );
    expect(ranked[0].booth.id).toBe("a");
  });

  it("boosts a booth with an in-window event over one without", () => {
    const ev: BoothEvent = {
      id: "ev",
      boothId: "e",
      title: "",
      description: "",
      startTime: "2026-06-10T10:30:00+09:00",
      endTime: "2026-06-10T11:00:00+09:00",
    };
    const ctxEvent = { ...ctx, eventsByBooth: { e: [ev] } };
    const noEvent = scoreBooth(booth({ id: "n", tags: ["ai"] }), ctxEvent);
    const withEvent = scoreBooth(booth({ id: "e", tags: ["ai"] }), ctxEvent);
    expect(withEvent.score).toBeGreaterThan(noEvent.score);
  });

  it("companion tilts the score (family weighs events more than alone)", () => {
    const ev: BoothEvent = {
      id: "ev",
      boothId: "w",
      title: "",
      description: "",
      startTime: "2026-06-10T10:30:00+09:00",
      endTime: "2026-06-10T11:00:00+09:00",
    };
    const eventsByBooth = { w: [ev] };
    const aloneCtx = {
      ...ctx,
      preference: { ...pref, companionType: "alone" as const },
      eventsByBooth,
    };
    const familyCtx = {
      ...ctx,
      preference: { ...pref, companionType: "family" as const },
      eventsByBooth,
    };
    const alone = scoreBooth(booth({ id: "w", tags: ["ai"] }), aloneCtx);
    const family = scoreBooth(booth({ id: "w", tags: ["ai"] }), familyCtx);
    // Same booth + event — a family weighs events/popularity higher, so differs.
    expect(family.score).toBeGreaterThan(alone.score);
  });
});
