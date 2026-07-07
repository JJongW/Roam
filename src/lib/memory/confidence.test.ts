import { describe, expect, it } from "vitest";
import type { SignalKind, UserSignal } from "@/lib/types";
import {
  computeConfidence,
  decay,
  dimensionOf,
  normalize,
  trendOf,
} from "./confidence";

const DAY = 86_400_000;
const NOW = Date.parse("2026-07-07T00:00:00Z");
const TUNING = { halfLifeDays: 90, K: 3 };

function sig(
  kind: SignalKind,
  daysAgo = 0,
  p: Partial<UserSignal> = {},
): UserSignal {
  return {
    id: "s",
    userId: "u",
    exhibitionId: "e",
    kind,
    slugs: ["lit"],
    createdAt: new Date(NOW - daysAgo * DAY).toISOString(),
    ...p,
  };
}

describe("decay", () => {
  it("반감기에서 0.5", () => {
    expect(decay(90 * DAY, 90 * DAY)).toBeCloseTo(0.5, 6);
  });
  it("Δt=0 이면 1", () => {
    expect(decay(0, 90 * DAY)).toBe(1);
  });
  it("음수/미래 Δt는 1로 클램프", () => {
    expect(decay(-5000, 90 * DAY)).toBe(1);
  });
});

describe("normalize", () => {
  it("0..1로 클램프", () => {
    expect(normalize(-2)).toBe(0);
    expect(normalize(5)).toBe(1);
    expect(normalize(0.4)).toBe(0.4);
  });
});

describe("dimensionOf", () => {
  it("종류별 대표 차원", () => {
    expect(dimensionOf("booth_visited")).toBe("implicit");
    expect(dimensionOf("booth_bookmarked")).toBe("explicit");
    expect(dimensionOf("booth_skipped")).toBe("negative");
  });
});

describe("computeConfidence", () => {
  it("방문 많을수록 높지만 1 미만", () => {
    const many = Array.from({ length: 100 }, () => sig("booth_visited"));
    const { confidence } = computeConfidence(many, NOW, TUNING);
    expect(confidence).toBeGreaterThan(0.9);
    expect(confidence).toBeLessThan(1);
  });

  it("명시(bookmark) > 암묵(visited) — 단일 신호", () => {
    const book = computeConfidence(
      [sig("booth_bookmarked")],
      NOW,
      TUNING,
    ).confidence;
    const visit = computeConfidence(
      [sig("booth_visited")],
      NOW,
      TUNING,
    ).confidence;
    expect(book).toBeGreaterThan(visit);
  });

  it("최근 신호가 과거보다 높은 confidence", () => {
    const recent = computeConfidence(
      [sig("booth_visited", 0)],
      NOW,
      TUNING,
    ).confidence;
    const old = computeConfidence(
      [sig("booth_visited", 180)],
      NOW,
      TUNING,
    ).confidence;
    expect(recent).toBeGreaterThan(old);
  });

  it("skip(음의 신호)만이면 confidence 0", () => {
    const { confidence } = computeConfidence(
      [sig("booth_skipped")],
      NOW,
      TUNING,
    );
    expect(confidence).toBe(0);
  });

  it("skip이 visited를 상쇄해 낮춤", () => {
    const withSkip = computeConfidence(
      [sig("booth_visited"), sig("booth_skipped")],
      NOW,
      TUNING,
    ).confidence;
    const only = computeConfidence(
      [sig("booth_visited")],
      NOW,
      TUNING,
    ).confidence;
    expect(withSkip).toBeLessThan(only);
    expect(withSkip).toBeGreaterThan(0);
  });

  it("차원별 카운트 집계", () => {
    const { signals } = computeConfidence(
      [sig("booth_visited"), sig("booth_bookmarked"), sig("booth_skipped")],
      NOW,
      TUNING,
    );
    expect(signals).toEqual({ explicit: 1, implicit: 1, negative: 1 });
  });
});

describe("trendOf", () => {
  it("신호 1개면 flat", () => {
    expect(trendOf([sig("booth_visited")], NOW, 90)).toBe("flat");
  });
  it("동시각 신호는 flat", () => {
    expect(
      trendOf([sig("booth_visited", 5), sig("booth_visited", 5)], NOW, 90),
    ).toBe("flat");
  });
  it("같은 세션(1분 이내) 신호는 flat", () => {
    const base = sig("booth_visited");
    const near: UserSignal = {
      ...base,
      createdAt: new Date(NOW - 10_000).toISOString(),
    };
    expect(trendOf([base, near, sig("booth_visited")], NOW, 90)).toBe("flat");
  });
  it("최근에 몰리면 up", () => {
    const s = [
      sig("booth_visited", 60),
      sig("booth_visited", 1),
      sig("booth_visited", 0),
    ];
    expect(trendOf(s, NOW, 90)).toBe("up");
  });
});
