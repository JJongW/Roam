import { describe, expect, it } from "vitest";
import type {
  SignalKind,
  UserBrain,
  UserSignal,
  VisitDigest,
} from "@/lib/types";
import {
  addVisitDigest,
  buildVisitDigest,
  distillInterests,
  emptyBrain,
  updateBrainWithSignals,
} from "./distill";

const DAY = 86_400_000;
const NOW = Date.parse("2026-07-07T00:00:00Z");
const TUNING = {
  halfLifeDays: 90,
  K: 3,
  thetaHi: 0.6,
  thetaLo: 0.15,
  topN: 30,
};

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
    const nodes = distillInterests(
      [sig("feed_click", ["lit", "art"])],
      NOW,
      TUNING,
    );
    expect(nodes.map((n) => n.key).sort()).toEqual(["art", "lit"]);
  });

  it("pass만 있는 slug은 제외(confidence 0)", () => {
    const nodes = distillInterests(
      [sig("reaction_pass", ["lit"])],
      NOW,
      TUNING,
    );
    expect(nodes).toEqual([]);
  });

  it("topN으로 상위만 유지 + confidence 내림차순", () => {
    const signals = [
      ...Array.from({ length: 5 }, () => sig("feed_click", ["lit"])),
      sig("feed_click", ["art"]),
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
    const noLabel = distillInterests(
      [sig("booth_bookmarked", ["art"])],
      NOW,
      TUNING,
    );
    expect(noLabel[0].label).toBe("art");
  });
});

describe("updateBrainWithSignals", () => {
  it("θhi 넘는 관심을 literacy로 승격", () => {
    // feed_click(암묵 0.3)은 옛 booth_visited(1.0)보다 약해 θhi(0.6)를 넘기려면
    // 신호 수가 더 필요하다 — 40개면 여유 있게 넘는다(20개는 raw=6,conf≈0.67로
    // 아슬아슬해 마진을 더 뒀다).
    const strong = Array.from({ length: 40 }, () => sig("feed_click", ["lit"]));
    const brain = updateBrainWithSignals(emptyBrain("u"), strong, NOW, TUNING);
    expect(brain.interests[0].key).toBe("lit");
    expect(brain.interests[0].confidence).toBeGreaterThanOrEqual(0.6);
    expect(brain.literacy.byTheme.lit).toBeGreaterThanOrEqual(0.6);
    expect(brain.literacy.overall).toBeGreaterThan(0);
  });

  it("약한 관심은 승격 안 됨(byTheme 비어있음)", () => {
    const brain = updateBrainWithSignals(
      emptyBrain("u"),
      [sig("feed_click", ["lit"])],
      NOW,
      TUNING,
    );
    expect(brain.interests).toHaveLength(1); // 관심엔 있으나
    expect(brain.literacy.byTheme).toEqual({}); // 승격은 안 됨
  });

  it("version 증가 + 부스/전시 카운트 (pass 제외)", () => {
    const signals = [
      sig("feed_click", ["lit"], 0, {
        boothCode: "A100",
        exhibitionId: "e1",
      }),
      sig("feed_click", ["lit"], 0, {
        boothCode: "A200",
        exhibitionId: "e2",
      }),
      sig("reaction_pass", ["lit"], 0, {
        boothCode: "A300",
        exhibitionId: "e1",
      }),
    ];
    const brain = updateBrainWithSignals(emptyBrain("u"), signals, NOW, TUNING);
    expect(brain.version).toBe(1);
    expect(brain.literacy.boothsSeenCount).toBe(2); // A300(pass) 제외
    expect(brain.literacy.visitsCount).toBe(0); // 완료 관람 없음(brain.visits 소유)
  });
});

const digest = (
  visitId: string,
  p: Partial<VisitDigest> = {},
): VisitDigest => ({
  exhibitionId: "e1",
  visitId,
  date: new Date(NOW).toISOString(),
  boothsVisited: ["A100"],
  themesEngaged: ["lit"],
  highlights: [],
  summary: "1개 부스 관람",
  ...p,
});

describe("buildVisitDigest", () => {
  it("빈도순 themesEngaged + 요약(라벨)", () => {
    const d = buildVisitDigest({
      exhibitionId: "e1",
      visitId: "r1",
      boothCodes: ["A1", "A2"],
      boothTagLists: [["lit", "art"], ["lit"]],
      nowMs: NOW,
      labels: { lit: "문학" },
    });
    expect(d.themesEngaged).toEqual(["lit", "art"]); // lit 2회 > art 1회
    expect(d.boothsVisited).toEqual(["A1", "A2"]);
    expect(d.summary).toBe("2개 부스 관람 · 주로 문학");
  });
});

describe("addVisitDigest", () => {
  it("접기 + visitsCount = 완료관람 수", () => {
    const b1 = addVisitDigest(emptyBrain("u"), digest("r1"), NOW);
    expect(b1.visits).toHaveLength(1);
    expect(b1.literacy.visitsCount).toBe(1);
    const b2 = addVisitDigest(b1, digest("r2"), NOW);
    expect(b2.literacy.visitsCount).toBe(2);
  });
  it("같은 visitId는 upsert(중복 아님)", () => {
    const b1 = addVisitDigest(
      emptyBrain("u"),
      digest("r1", { summary: "old" }),
      NOW,
    );
    const b2 = addVisitDigest(b1, digest("r1", { summary: "new" }), NOW);
    expect(b2.visits).toHaveLength(1);
    expect(b2.visits[0].summary).toBe("new");
  });
  it("이후 신호 증류가 visits/visitsCount를 보존", () => {
    const withVisit = addVisitDigest(emptyBrain("u"), digest("r1"), NOW);
    const after = updateBrainWithSignals(
      withVisit,
      [sig("feed_click", ["lit"], 0)],
      NOW,
      TUNING,
    );
    expect(after.visits).toHaveLength(1);
    expect(after.literacy.visitsCount).toBe(1);
  });
});

describe("mutedSlugs", () => {
  // 사용자의 "이건 내 취향 아니야"는 과거 행동의 부정이 아니라 현재 상태 선언이다.
  // 원장(신호)은 그대로 두고 표시·추천에서만 뺀다 — 그래야 되돌리기가 자연스럽다.
  const signals: UserSignal[] = [
    {
      id: "s1",
      userId: "u1",
      exhibitionId: "e1",
      kind: "reaction_must",
      slugs: ["goods"],
      createdAt: new Date(0).toISOString(),
    },
    {
      id: "s2",
      userId: "u1",
      exhibitionId: "e1",
      kind: "reaction_must",
      slugs: ["discovery"],
      createdAt: new Date(0).toISOString(),
    },
  ];

  it("emptyBrain은 뮤트 목록이 빈 배열", () => {
    expect(emptyBrain("u1").mutedSlugs).toEqual([]);
  });

  it("뮤트된 slug는 interests에서 빠진다", () => {
    const base = { ...emptyBrain("u1"), mutedSlugs: ["goods"] };
    const next = updateBrainWithSignals(base, signals, 0);
    const keys = next.interests.map((n) => n.key);
    expect(keys).toContain("discovery");
    expect(keys).not.toContain("goods");
  });

  it("뮤트를 풀면 그동안 쌓인 confidence가 그대로 돌아온다", () => {
    const muted = updateBrainWithSignals(
      { ...emptyBrain("u1"), mutedSlugs: ["goods"] },
      signals,
      0,
    );
    const unmuted = updateBrainWithSignals(
      { ...muted, mutedSlugs: [] },
      signals,
      0,
    );
    const goods = unmuted.interests.find((n) => n.key === "goods");
    expect(goods).toBeDefined();
    expect(goods!.confidence).toBeGreaterThan(0);
  });

  it("뮤트 목록은 재증류를 거쳐도 유지된다", () => {
    const next = updateBrainWithSignals(
      { ...emptyBrain("u1"), mutedSlugs: ["goods"] },
      signals,
      0,
    );
    expect(next.mutedSlugs).toEqual(["goods"]);
  });

  it("레거시 브레인(mutedSlugs 없음)도 깨지지 않는다", () => {
    const legacy = { ...emptyBrain("u1") } as UserBrain;
    delete (legacy as Partial<UserBrain>).mutedSlugs;
    const next = updateBrainWithSignals(legacy, signals, 0);
    expect(next.interests.map((n) => n.key)).toContain("goods");
  });
});
