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
    expect(dimensionOf("feed_click")).toBe("implicit");
    expect(dimensionOf("booth_bookmarked")).toBe("explicit");
    expect(dimensionOf("reaction_pass")).toBe("negative");
  });

  it("판단 어휘 재설계 이전 폐기된 kind는 안 죽고 implicit로 폴백", () => {
    // 2026-08-10 재설계 전 kind(booth_visited 등)가 prod에 남아 있다 —
    // SIGNAL_WEIGHTS에 없는 값이 와도 크래시하면 안 된다.
    expect(dimensionOf("booth_visited" as SignalKind)).toBe("implicit");
  });
});

describe("computeConfidence", () => {
  it("방문 많을수록 높지만 1 미만", () => {
    // feed_click(암묵 0.3)은 옛 booth_visited(1.0)보다 약해 같은 confidence에
    // 도달하려면 신호 수가 더 필요하다 — 500개면 0.9를 여유 있게 넘는다.
    const many = Array.from({ length: 500 }, () => sig("feed_click"));
    const { confidence } = computeConfidence(many, NOW, TUNING);
    expect(confidence).toBeGreaterThan(0.9);
    expect(confidence).toBeLessThan(1);
  });

  it("명시(bookmark) > 암묵(feed_click) — 단일 신호", () => {
    const book = computeConfidence(
      [sig("booth_bookmarked")],
      NOW,
      TUNING,
    ).confidence;
    const click = computeConfidence(
      [sig("feed_click")],
      NOW,
      TUNING,
    ).confidence;
    expect(book).toBeGreaterThan(click);
  });

  it("최근 신호가 과거보다 높은 confidence", () => {
    const recent = computeConfidence(
      [sig("feed_click", 0)],
      NOW,
      TUNING,
    ).confidence;
    const old = computeConfidence(
      [sig("feed_click", 180)],
      NOW,
      TUNING,
    ).confidence;
    expect(recent).toBeGreaterThan(old);
  });

  it("pass(음의 신호)만이면 confidence 0", () => {
    const { confidence } = computeConfidence(
      [sig("reaction_pass")],
      NOW,
      TUNING,
    );
    expect(confidence).toBe(0);
  });

  it("pass가 feed_click을 상쇄해 낮춤", () => {
    // reaction_pass(음 0.5)가 feed_click(암묵 0.3) 1개보다 세서 순합이 뒤집힌다
    // (옛 booth_skipped 0.8 vs booth_visited 1.0과 반대) — feed_click 수를 늘려
    // "상쇄하되 0 아래로는 안 감"이라는 의도를 다시 성립시킨다.
    const withPass = computeConfidence(
      [
        sig("feed_click"),
        sig("feed_click"),
        sig("feed_click"),
        sig("reaction_pass"),
      ],
      NOW,
      TUNING,
    ).confidence;
    const only = computeConfidence(
      [sig("feed_click"), sig("feed_click"), sig("feed_click")],
      NOW,
      TUNING,
    ).confidence;
    expect(withPass).toBeLessThan(only);
    expect(withPass).toBeGreaterThan(0);
  });

  it("차원별 카운트 집계", () => {
    const { signals } = computeConfidence(
      [sig("feed_click"), sig("booth_bookmarked"), sig("reaction_pass")],
      NOW,
      TUNING,
    );
    expect(signals).toEqual({ explicit: 1, implicit: 1, negative: 1 });
  });

  it("폐기된 옛 kind가 섞여도 안 죽고 무시한다", () => {
    const { confidence, signals } = computeConfidence(
      [
        sig("booth_visited" as SignalKind),
        sig("booth_skipped" as SignalKind),
        sig("booth_bookmarked"),
      ],
      NOW,
      TUNING,
    );
    expect(signals).toEqual({ explicit: 1, implicit: 0, negative: 0 });
    expect(confidence).toBeGreaterThan(0);
  });
});

describe("trendOf", () => {
  it("신호 1개면 flat", () => {
    expect(trendOf([sig("feed_click")], NOW, 90)).toBe("flat");
  });
  it("동시각 신호는 flat", () => {
    expect(trendOf([sig("feed_click", 5), sig("feed_click", 5)], NOW, 90)).toBe(
      "flat",
    );
  });
  it("같은 세션(1분 이내) 신호는 flat", () => {
    const base = sig("feed_click");
    const near: UserSignal = {
      ...base,
      createdAt: new Date(NOW - 10_000).toISOString(),
    };
    expect(trendOf([base, near, sig("feed_click")], NOW, 90)).toBe("flat");
  });
  it("최근에 몰리면 up", () => {
    const s = [
      sig("feed_click", 60),
      sig("feed_click", 1),
      sig("feed_click", 0),
    ];
    expect(trendOf(s, NOW, 90)).toBe("up");
  });
});
