import { describe, expect, it } from "vitest";
import type { SignalKind, UserSignal } from "@/lib/types";
import { distillInterests, emptyBrain, updateBrainWithSignals } from "./distill";

const DAY = 86_400_000;
const NOW = Date.parse("2026-07-07T00:00:00Z");
const TUNING = { halfLifeDays: 90, K: 3, thetaHi: 0.6, thetaLo: 0.15, topN: 30 };

let counter = 0;
function sig(
  kind: SignalKind,
  slugs: string[],
  daysAgo = 0,
  p: Partial<UserSignal> = {},
): UserSignal {
  return {
    id: `s${counter++}`,
    userId: "u",
    exhibitionId: "e1",
    kind,
    boothCode: "A100",
    slugs,
    createdAt: new Date(NOW - daysAgo * DAY).toISOString(),
    ...p,
  };
}

describe("emptyBrain", () => {
  it("빈 브레인 기본 형태", () => {
    const b = emptyBrain("u", new Date(NOW).toISOString());
    expect(b.userId).toBe("u");
    expect(b.version).toBe(0);
    expect(b.interests).toEqual([]);
    expect(b.literacy.overall).toBe(0);
    expect(b.health.decayHalfLifeDays).toBe(90);
  });
});

describe("distillInterests", () => {
  it("한 신호의 여러 slug이 각 노드로 분기", () => {
    const nodes = distillInterests([sig("booth_visited", ["lit", "art"])], NOW, TUNING);
    expect(nodes.map((n) => n.key).sort()).toEqual(["art", "lit"]);
  });

  it("skip만 있는 slug은 제외(confidence 0)", () => {
    const nodes = distillInterests([sig("booth_skipped", ["lit"])], NOW, TUNING);
    expect(nodes).toEqual([]);
  });

  it("topN으로 상위만 유지 + confidence 내림차순", () => {
    const signals = [
      ...Array.from({ length: 5 }, () => sig("booth_visited", ["lit"])),
      sig("booth_visited", ["art"]),
    ];
    const nodes = distillInterests(signals, NOW, { ...TUNING, topN: 1 }, {});
    expect(nodes).toHaveLength(1);
    expect(nodes[0].key).toBe("lit"); // 신호 많은 쪽이 상위
  });

  it("label 맵 적용, 없으면 slug", () => {
    const nodes = distillInterests(
      [sig("booth_bookmarked", ["lit"])],
      NOW,
      TUNING,
      { lit: "문학" },
    );
    expect(nodes[0].label).toBe("문학");
    const noLabel = distillInterests([sig("booth_bookmarked", ["art"])], NOW, TUNING);
    expect(noLabel[0].label).toBe("art");
  });
});

describe("updateBrainWithSignals", () => {
  it("θhi 넘는 관심을 literacy로 승격", () => {
    const strong = Array.from({ length: 20 }, () => sig("booth_visited", ["lit"]));
    const brain = updateBrainWithSignals(emptyBrain("u"), strong, NOW, TUNING);
    expect(brain.interests[0].key).toBe("lit");
    expect(brain.interests[0].confidence).toBeGreaterThanOrEqual(0.6);
    expect(brain.literacy.byTheme.lit).toBeGreaterThanOrEqual(0.6);
    expect(brain.literacy.overall).toBeGreaterThan(0);
  });

  it("약한 관심은 승격 안 됨(byTheme 비어있음)", () => {
    const brain = updateBrainWithSignals(
      emptyBrain("u"),
      [sig("booth_visited", ["lit"])],
      NOW,
      TUNING,
    );
    expect(brain.interests).toHaveLength(1); // 관심엔 있으나
    expect(brain.literacy.byTheme).toEqual({}); // 승격은 안 됨
  });

  it("version 증가 + 부스/전시 카운트 (skip 제외)", () => {
    const signals = [
      sig("booth_visited", ["lit"], 0, { boothCode: "A100", exhibitionId: "e1" }),
      sig("booth_visited", ["lit"], 0, { boothCode: "A200", exhibitionId: "e2" }),
      sig("booth_skipped", ["lit"], 0, { boothCode: "A300", exhibitionId: "e1" }),
    ];
    const brain = updateBrainWithSignals(emptyBrain("u"), signals, NOW, TUNING);
    expect(brain.version).toBe(1);
    expect(brain.literacy.boothsSeenCount).toBe(2); // A300(skip) 제외
    expect(brain.literacy.visitsCount).toBe(2); // e1, e2
  });
});
