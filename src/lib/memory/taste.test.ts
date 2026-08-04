import { describe, expect, it } from "vitest";
import {
  classifyBooth,
  computeTasteAccuracy,
  INSIGHT_THRESHOLD,
  judgmentScore,
} from "./taste";
import { emptyBrain } from "./distill";
import type { Booth, UserBrain } from "@/lib/types";

function booth(valueTags: { slug: string; strength: number }[]): Booth {
  return {
    id: "b1",
    exhibitionId: "e1",
    hallId: "h1",
    categoryId: "c1",
    name: "테스트 부스",
    company: "테스트",
    description: "",
    longDescription: "",
    images: [],
    tags: valueTags.map((v) => v.slug),
    valueTags,
    x: 0,
    y: 0,
    popularity: 0,
    createdAt: "",
  };
}

function brainWith(interests: { key: string; confidence: number }[]): UserBrain {
  const b = emptyBrain("u1");
  return {
    ...b,
    interests: interests.map((i) => ({
      key: i.key,
      label: i.key,
      confidence: i.confidence,
      signals: { explicit: 0, implicit: 0, negative: 0 },
      firstSeenAt: "",
      lastSeenAt: "",
      trend: "flat" as const,
    })),
  };
}

describe("classifyBooth", () => {
  it("부스 가치가 확신 가치(0.25 이상)와 겹치면 confident", () => {
    const b = booth([{ slug: "discovery", strength: 0.8 }]);
    const brain = brainWith([{ key: "discovery", confidence: 0.4 }]);
    expect(classifyBooth(b, brain)).toBe("confident");
  });

  it("겹치는 확신 가치가 없으면 uncertain", () => {
    const b = booth([{ slug: "rest", strength: 0.8 }]);
    const brain = brainWith([{ key: "discovery", confidence: 0.4 }]);
    expect(classifyBooth(b, brain)).toBe("uncertain");
  });

  it("확신 가치가 임계값(0.25) 미만이면 uncertain — 아직 확신이 아니다", () => {
    const b = booth([{ slug: "discovery", strength: 0.8 }]);
    const brain = brainWith([{ key: "discovery", confidence: 0.1 }]);
    expect(classifyBooth(b, brain)).toBe("uncertain");
  });

  it("브레인이 비어 있으면(온보딩 직후) 모든 부스가 uncertain", () => {
    const b = booth([{ slug: "discovery", strength: 0.8 }]);
    expect(classifyBooth(b, emptyBrain("u1"))).toBe("uncertain");
  });
});

describe("judgmentScore", () => {
  it("끌림은 확신도와 무관하게 +1", () => {
    expect(judgmentScore("interested", "confident", undefined)).toBe(1);
    expect(judgmentScore("interested", "uncertain", undefined)).toBe(1);
  });

  it("나중에는 확신도와 무관하게 +0.3", () => {
    expect(judgmentScore("later", "confident", undefined)).toBe(0.3);
    expect(judgmentScore("later", "uncertain", undefined)).toBe(0.3);
  });

  it("별로는 confident일 때만 -1, uncertain이면 0(벌점 없음)", () => {
    expect(judgmentScore("skipped", "confident", undefined)).toBe(-1);
    expect(judgmentScore("skipped", "uncertain", undefined)).toBe(0);
  });

  it("가봄은 되묻기 답이 없으면 채점 제외(null)", () => {
    expect(judgmentScore("visited", "confident", undefined)).toBeNull();
    expect(judgmentScore("visited", null, undefined)).toBeNull();
  });

  it("가봄 + 되묻기 답은 별로와 같은 규칙(긍정 +1, 부정은 confident일 때만 -1)", () => {
    expect(judgmentScore("visited", "confident", "liked")).toBe(1);
    expect(judgmentScore("visited", "uncertain", "liked")).toBe(1);
    expect(judgmentScore("visited", "confident", "disliked")).toBe(-1);
    expect(judgmentScore("visited", "uncertain", "disliked")).toBe(0);
  });

  it("상태 없음(해제)은 채점 제외", () => {
    expect(judgmentScore(undefined, null, undefined)).toBeNull();
  });

  it("판정이 없으면(judgedClass null) 상태와 무관하게 채점 제외 — 소급 채점 금지", () => {
    expect(judgmentScore("interested", null, undefined)).toBeNull();
    expect(judgmentScore("later", null, undefined)).toBeNull();
    expect(judgmentScore("skipped", null, undefined)).toBeNull();
  });
});

describe("computeTasteAccuracy", () => {
  it("판정이 임계값 미만이면 pct는 null이어도 judgedCount는 정확하다", () => {
    const notes = [
      { status: "interested" as const, judgedClass: "confident" as const, retro: undefined },
      { status: "skipped" as const, judgedClass: "confident" as const, retro: undefined },
    ];
    const r = computeTasteAccuracy(notes);
    expect(r.judgedCount).toBe(2);
    expect(r.pct).toBeNull();
    expect(INSIGHT_THRESHOLD).toBe(5);
  });

  it("판정 5개, 4개 맞춤 1개 틀림(confident) → 80%", () => {
    const notes = [
      { status: "interested" as const, judgedClass: "confident" as const, retro: undefined },
      { status: "interested" as const, judgedClass: "confident" as const, retro: undefined },
      { status: "interested" as const, judgedClass: "confident" as const, retro: undefined },
      { status: "interested" as const, judgedClass: "confident" as const, retro: undefined },
      { status: "skipped" as const, judgedClass: "confident" as const, retro: undefined },
    ];
    const r = computeTasteAccuracy(notes);
    expect(r.judgedCount).toBe(5);
    expect(r.pct).toBe(80);
  });

  it("가봄(무응답)은 judgedCount에 안 들어간다", () => {
    const notes = [
      { status: "interested" as const, judgedClass: "confident" as const, retro: undefined },
      { status: "visited" as const, judgedClass: null, retro: undefined },
    ];
    const r = computeTasteAccuracy(notes);
    expect(r.judgedCount).toBe(1);
  });

  it("uncertain 별로 5개(전부 벌점 없음, 0점)는 50%", () => {
    const notes = Array.from({ length: 5 }, () => ({
      status: "skipped" as const,
      judgedClass: "uncertain" as const,
      retro: undefined,
    }));
    const r = computeTasteAccuracy(notes);
    expect(r.pct).toBe(50);
  });
});
