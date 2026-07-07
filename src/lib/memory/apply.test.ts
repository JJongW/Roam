import { describe, expect, it } from "vitest";
import type { Booth, InterestNode, UserBrain } from "@/lib/types";
import { rankBooths, type ScoreContext } from "@/lib/engine/scoring";
import { emptyBrain } from "./distill";
import { brainInterestWeights, mergeBrainInterests } from "./apply";

function node(key: string, confidence: number): InterestNode {
  return {
    key,
    label: key,
    confidence,
    signals: { explicit: 0, implicit: 1, negative: 0 },
    firstSeenAt: "2026-01-01T00:00:00Z",
    lastSeenAt: "2026-01-01T00:00:00Z",
    trend: "flat",
  };
}

function brainWith(nodes: InterestNode[]): UserBrain {
  return { ...emptyBrain("u"), interests: nodes };
}

describe("mergeBrainInterests", () => {
  it("빈 브레인이면 base 그대로", () => {
    expect(mergeBrainInterests(["lit"], emptyBrain("u"))).toEqual(["lit"]);
  });

  it("브레인 관심을 base 뒤에 합침(중복 제거)", () => {
    const brain = brainWith([node("art", 0.7), node("lit", 0.6)]);
    expect(mergeBrainInterests(["lit"], brain)).toEqual(["lit", "art"]);
  });

  it("minConfidence 미만은 주입 안 함", () => {
    const brain = brainWith([node("art", 0.7), node("weak", 0.1)]);
    expect(mergeBrainInterests([], brain)).toEqual(["art"]);
  });

  it("confidence 내림차순 + max 컷", () => {
    const brain = brainWith([node("a", 0.9), node("b", 0.8), node("c", 0.7)]);
    expect(mergeBrainInterests([], brain, { max: 2 })).toEqual(["a", "b"]);
  });

  it("base 우선 순서 유지", () => {
    const brain = brainWith([node("x", 0.9)]);
    expect(mergeBrainInterests(["p", "q"], brain)).toEqual(["p", "q", "x"]);
  });
});

// 페이오프 증명: 병합된 interests가 랭킹을 의도 방향으로 바꾼다(누적 관심 반영).
function booth(id: string, tags: string[]): Booth {
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
    tags,
    x: 0,
    y: 0,
    popularity: 50,
    createdAt: "2026-01-01T00:00:00Z",
  } as Booth;
}

function ctx(
  interests: string[],
  interestWeights?: Record<string, number>,
): ScoreContext {
  return {
    preference: {
      visitPurposes: ["experience"],
      interests,
      availableMinutes: 60,
      companionType: "alone",
    },
    eventsByBooth: {},
    now: 0,
    interestWeights,
  };
}

describe("brainInterestWeights", () => {
  it("세션=1, 브레인=1+confidence, 겹치면 큰 쪽", () => {
    const brain = brainWith([node("lit", 0.6), node("tech", 0.5)]);
    const w = brainInterestWeights(["tech"], brain);
    expect(w.tech).toBeCloseTo(1.5, 5); // 세션 1 vs 브레인 1.5 → 큰 쪽
    expect(w.lit).toBeCloseTo(1.6, 5); // 브레인만
  });
  it("빈 브레인이면 base 전부 1", () => {
    expect(brainInterestWeights(["a", "b"], emptyBrain("u"))).toEqual({
      a: 1,
      b: 1,
    });
  });
});

describe("mergeBrainInterests → 랭킹 반영", () => {
  const litBooth = booth("lit1", ["lit"]);
  const techBooth = booth("tech1", ["tech"]);

  it("lit 브레인 주입 전엔 lit 부스 interest=0", () => {
    const ranked = rankBooths([litBooth, techBooth], ctx(["tech"]));
    const lit = ranked.find((r) => r.booth.id === "lit1")!;
    expect(lit.breakdown.interest).toBe(0);
  });

  it("lit 브레인 주입 후 lit 부스 score 상승(무시→경쟁력)", () => {
    const before = rankBooths([litBooth, techBooth], ctx(["tech"]));
    const litBefore = before.find((r) => r.booth.id === "lit1")!;

    const brain = brainWith([node("lit", 0.67)]);
    const merged = mergeBrainInterests(["tech"], brain); // ["tech","lit"] — 둘 다 반영
    const after = rankBooths([litBooth, techBooth], ctx(merged));
    const litAfter = after.find((r) => r.booth.id === "lit1")!;

    expect(litBefore.breakdown.interest).toBe(0); // 세션 의도만이면 무시됨
    expect(litAfter.breakdown.interest).toBeGreaterThan(0); // 누적 관심으로 경쟁력
    expect(litAfter.score).toBeGreaterThan(litBefore.score);
  });

  it("confidence 가중이면 브레인 관심(lit)이 세션(tech)보다 우세 — rank #1", () => {
    const brain = brainWith([node("lit", 0.67)]);
    const interests = mergeBrainInterests(["tech"], brain); // ["tech","lit"]
    const weights = brainInterestWeights(["tech"], brain); // {tech:1, lit:1.67}
    const ranked = rankBooths([litBooth, techBooth], ctx(interests, weights));
    expect(ranked[0].booth.id).toBe("lit1"); // 가중으로 lit이 tech를 앞선다
    const lit = ranked.find((r) => r.booth.id === "lit1")!;
    const tech = ranked.find((r) => r.booth.id === "tech1")!;
    expect(lit.breakdown.interest).toBeGreaterThan(tech.breakdown.interest);
  });
});
