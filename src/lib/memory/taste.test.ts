import { describe, expect, it } from "vitest";
import {
  classifyBooth,
  computeTasteAccuracy,
  judgmentScore,
  INSIGHT_THRESHOLD,
} from "./taste";
import type { Booth, UserBrain } from "@/lib/types";

const brain = (confidence: number): UserBrain => ({
  userId: "u1",
  version: 1,
  updatedAt: "",
  literacy: { overall: 0, byTheme: {}, visitsCount: 0, boothsSeenCount: 0 },
  interests: [
    {
      key: "goods",
      label: "굿즈",
      confidence,
      signals: { explicit: 0, implicit: 0, negative: 0 },
      firstSeenAt: "",
      lastSeenAt: "",
      trend: "flat",
    },
  ],
  mutedSlugs: [],
  preferences: {},
  goals: [],
  visits: [],
  health: { lastDistilledAt: "", decayHalfLifeDays: 90 },
});

const booth = (tags: string[]): Booth => ({
  id: "b1",
  exhibitionId: "e1",
  hallId: "h1",
  categoryId: "c1",
  name: "부스",
  company: "",
  description: "",
  longDescription: "",
  images: [],
  tags,
  x: 0,
  y: 0,
  popularity: 0,
  createdAt: "",
});

describe("classifyBooth", () => {
  it("확신 가치와 겹치면 confident", () => {
    expect(classifyBooth(booth(["goods"]), brain(0.3))).toBe("confident");
  });
  it("겹치는 확신 가치가 없으면 uncertain", () => {
    expect(classifyBooth(booth(["trend"]), brain(0.3))).toBe("uncertain");
  });
});

describe("judgmentScore — verdict 우선", () => {
  it("verdict='good'은 confident 여부와 무관하게 +1", () => {
    expect(judgmentScore(null, "good", "confident")).toBe(1);
    expect(judgmentScore(null, "good", "uncertain")).toBe(1);
  });
  it("verdict='ok'는 항상 0", () => {
    expect(judgmentScore("must", "ok", "confident")).toBe(0);
    expect(judgmentScore(null, "ok", "uncertain")).toBe(0);
  });
  it("verdict='bad'는 confident면 -1, uncertain이면 0", () => {
    expect(judgmentScore(null, "bad", "confident")).toBe(-1);
    expect(judgmentScore(null, "bad", "uncertain")).toBe(0);
  });
  it("verdict가 있으면 interest는 완전히 무시된다", () => {
    // must(예측 긍정)여도 verdict=bad(결과 부정)면 결과가 이긴다.
    expect(judgmentScore("must", "bad", "confident")).toBe(-1);
  });

  it("verdict 없을 때 interest='must'는 +1", () => {
    expect(judgmentScore("must", null, "confident")).toBe(1);
  });
  it("verdict 없을 때 interest='curious'는 +0.6", () => {
    expect(judgmentScore("curious", null, "uncertain")).toBe(0.6);
  });
  it("verdict 없을 때 interest='pass'는 confident면 -1, uncertain이면 0", () => {
    expect(judgmentScore("pass", null, "confident")).toBe(-1);
    expect(judgmentScore("pass", null, "uncertain")).toBe(0);
  });
  it("interest·verdict 둘 다 없으면 null(채점 제외)", () => {
    expect(judgmentScore(null, null, "confident")).toBeNull();
  });
  it("judgedClass가 없으면(소급 채점 금지) 무조건 null", () => {
    expect(judgmentScore("must", null, null)).toBeNull();
    expect(judgmentScore(null, "good", undefined)).toBeNull();
  });
});

describe("computeTasteAccuracy", () => {
  it("판정이 임계값 미만이면 pct는 null이어도 judgedCount는 정확하다", () => {
    const notes = Array.from({ length: 3 }, () => ({
      interest: "must" as const,
      verdict: null,
      judgedClass: "confident" as const,
    }));
    const r = computeTasteAccuracy(notes);
    expect(r.judgedCount).toBe(3);
    expect(r.pct).toBeNull();
  });

  it(`판정 ${INSIGHT_THRESHOLD}개, 1개만 틀림(confident verdict=bad) → 80%`, () => {
    const notes = [
      ...Array.from({ length: 4 }, () => ({
        interest: null,
        verdict: "good" as const,
        judgedClass: "confident" as const,
      })),
      { interest: null, verdict: "bad" as const, judgedClass: "confident" as const },
    ];
    const r = computeTasteAccuracy(notes);
    expect(r.judgedCount).toBe(5);
    // (4*1 + 1*-1) / 5 = 0.6 → (0.6+1)/2*100 = 80
    expect(r.pct).toBe(80);
  });

  it("verdict 없는 must+curious 조합도 채점된다", () => {
    const notes = [
      { interest: "must" as const, verdict: null, judgedClass: "confident" as const },
      { interest: "curious" as const, verdict: null, judgedClass: "uncertain" as const },
      { interest: null, verdict: null, judgedClass: "confident" as const },
      { interest: null, verdict: null, judgedClass: "confident" as const },
      { interest: null, verdict: null, judgedClass: "confident" as const },
    ];
    const r = computeTasteAccuracy(notes);
    // interest만 있는 2개만 채점 대상(null,null인 3개는 제외) → judgedCount 2
    expect(r.judgedCount).toBe(2);
  });
});
