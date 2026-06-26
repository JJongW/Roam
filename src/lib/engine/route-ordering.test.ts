// QA: 최단경로 최적화(NN 스윕 + 홀 스윕) 검증.
// 유닛별 / 경우의 수별로 쪼개 invariant를 못박는다. 알고리즘은 그리디 NN이라
// 전역 최적(TSP)은 아니지만, (1) 입력 순서 무관하게 NN 순서를 내고 (2) 홀 경계를
// 넘나드는 지그재그를 막고 (3) 단순 입력순 대비 더 짧다는 것을 보장해야 한다.
import { describe, expect, it } from "vitest";
import {
  buildHallSweepRoute,
  buildManualRoute,
  buildOrderedRoute,
  planRoute,
} from "./route";
import { distance } from "./scoring";
import type { Booth, Point, ScoredBooth } from "@/lib/types";

function bd(id: string, x: number, y: number, hallId = "h1"): Booth {
  return {
    id,
    exhibitionId: "e1",
    hallId,
    categoryId: "c1",
    name: id,
    company: "Co",
    description: "",
    longDescription: "",
    images: [],
    tags: [],
    x,
    y,
    popularity: 50,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}
function scored(b: Booth, score = 0.5): ScoredBooth {
  return { booth: b, score, breakdown: { interest: 0, popularity: 0, event: 0 } };
}

/** 경로 총 이동거리(start→…). leg.distance 합. */
function pathDistance(legs: { distance: number }[]): number {
  return legs.reduce((s, l) => s + l.distance, 0);
}
/** 부스 배열을 주어진 순서 그대로 돌 때의 총 이동거리(start 포함). */
function orderedDistance(start: Point, booths: Booth[]): number {
  let cur: Point = start;
  let d = 0;
  for (const b of booths) {
    d += distance(cur, b);
    cur = b;
  }
  return d;
}

const START: Point = { x: 0, y: 0 };

// ───────────────────────────── UNIT A: NN 스윕 ─────────────────────────────
describe("UNIT A — nearest-neighbour 스윕 (buildManualRoute)", () => {
  it("A1 collinear: 입력 순서가 뒤죽박죽이어도 입구 최근접 순서로 정렬", () => {
    const p1 = bd("p1", 10, 0);
    const p2 = bd("p2", 20, 0);
    const p3 = bd("p3", 30, 0);
    const r = buildManualRoute([p3, p1, p2], START);
    expect(r.boothIds).toEqual(["p1", "p2", "p3"]);
  });

  it("A2 zigzag 함정: NN이 단순 입력순보다 더 짧다", () => {
    // start=0. A 멀리(100), B 가까이(10), C 가장 멀리(110).
    const A = bd("A", 100, 0);
    const B = bd("B", 10, 0);
    const C = bd("C", 110, 0);
    const nn = buildManualRoute([A, B, C], START); // NN 재정렬
    const naive = orderedDistance(START, [A, B, C]); // 입력순 그대로
    expect(nn.boothIds).toEqual(["B", "A", "C"]);
    expect(pathDistance(nn.legs)).toBeLessThan(naive);
  });

  it("A3 2D: 각 스텝에서 항상 남은 것 중 최근접을 고른다", () => {
    const booths = [
      bd("far", 300, 300),
      bd("near", 10, 10),
      bd("mid", 100, 100),
    ];
    const r = buildManualRoute(booths, START);
    expect(r.boothIds).toEqual(["near", "mid", "far"]);
    // NN invariant: 각 leg 거리는 그 시점 남은 후보 최소거리와 같아야 한다.
    expect(r.legs[0].to).toBe("near");
  });

  it("A4 단일 부스", () => {
    const r = buildManualRoute([bd("solo", 50, 50)], START);
    expect(r.boothIds).toEqual(["solo"]);
    expect(r.legs).toHaveLength(1);
  });

  it("A5 빈 입력 → 빈 경로", () => {
    const r = buildManualRoute([], START);
    expect(r.boothIds).toEqual([]);
    expect(r.legs).toEqual([]);
    expect(r.estimatedMinutes).toBe(0);
  });

  it("A6 동률 거리: 결정론(첫 등장 인덱스 우선)", () => {
    // (10,0)과 (0,10)은 start에서 거리 동일 → 입력상 먼저 온 것이 먼저.
    const x = bd("x", 10, 0);
    const y = bd("y", 0, 10);
    expect(buildManualRoute([x, y], START).boothIds[0]).toBe("x");
    expect(buildManualRoute([y, x], START).boothIds[0]).toBe("y");
  });
});

// ─────────────────────── UNIT B: 홀 스윕 (지그재그 차단) ───────────────────────
describe("UNIT B — buildHallSweepRoute", () => {
  // H1: 입구 근처(위), H2: 멀리(아래).
  const h1 = [bd("h1a", 100, 0, "H1"), bd("h1b", 150, 0, "H1")];
  const h2 = [bd("h2a", 100, 500, "H2"), bd("h2b", 150, 500, "H2")];

  function hallOf(id: string): string {
    return id.startsWith("h1") ? "H1" : "H2";
  }
  /** 홀 시퀀스에서 전환 횟수(연속 같은 홀은 1로). */
  function transitions(ids: string[]): number {
    let t = 0;
    for (let i = 1; i < ids.length; i++) {
      if (hallOf(ids[i]) !== hallOf(ids[i - 1])) t++;
    }
    return t;
  }

  it("B1 홀 묶음 연속성: 두 홀 부스를 섞어 넣어도 같은 홀끼리 인접(전환 1회)", () => {
    const mixed = [h2[0], h1[0], h2[1], h1[1]];
    const r = buildHallSweepRoute(mixed, START);
    expect(transitions(r.boothIds)).toBe(1); // 홀 2개 → 전환 정확히 1
  });

  it("B2 홀 방문 순서: 입구에서 가까운 홀(H1) 먼저", () => {
    const r = buildHallSweepRoute([h2[0], h1[0], h2[1], h1[1]], START);
    expect(hallOf(r.boothIds[0])).toBe("H1");
    expect(hallOf(r.boothIds[3])).toBe("H2");
  });

  it("B3 홀 내부 NN: H1 안에서 입구 최근접부터", () => {
    const r = buildHallSweepRoute([h1[1], h1[0]], START); // 150 먼저 넣어도
    expect(r.boothIds).toEqual(["h1a", "h1b"]); // 100(가까움) 먼저
  });

  it("B4 출구(end) 인지: 출구가 H1 근처면 H1을 마지막으로 미룬다", () => {
    const end: Point = { x: 125, y: 0 }; // H1 한가운데 = 출구
    const r = buildHallSweepRoute([h1[0], h1[1], h2[0], h2[1]], START, {}, end);
    // 입구·출구가 모두 H1 쪽이지만 출구 근접 페널티로 H2를 먼저 돌고 H1로 빠진다.
    expect(hallOf(r.boothIds[0])).toBe("H2");
    expect(hallOf(r.boothIds[3])).toBe("H1");
  });

  it("B5 hallId 없는 부스도 누락 없이 한 그룹으로 포함", () => {
    const noHall = [bd("n1", 10, 10, ""), bd("n2", 20, 20, "")];
    const r = buildHallSweepRoute(noHall, START);
    expect(r.boothIds.sort()).toEqual(["n1", "n2"]);
  });

  it("B6 단일 홀이면 순수 NN과 동일", () => {
    const single = [bd("a", 30, 0, "H1"), bd("b", 10, 0, "H1"), bd("c", 20, 0, "H1")];
    const sweep = buildHallSweepRoute(single, START);
    const nn = buildManualRoute(single, START);
    expect(sweep.boothIds).toEqual(nn.boothIds);
  });

  it("B7 홀 스윕이 홀 무시 NN보다 지그재그가 적다(전환 횟수)", () => {
    // 홀을 가로지르며 가까운 점이 번갈아 있는 배치: 순수 NN은 왕복, 홀 스윕은 1전환.
    const inter = [
      bd("h1a", 0, 0, "H1"),
      bd("h2a", 1, 1, "H2"),
      bd("h1b", 2, 0, "H1"),
      bd("h2b", 3, 1, "H2"),
    ];
    const sweep = buildHallSweepRoute(inter, { x: -10, y: 0 });
    const pureNN = buildManualRoute(inter, { x: -10, y: 0 });
    expect(transitions(sweep.boothIds)).toBeLessThanOrEqual(
      transitions(pureNN.boothIds),
    );
    expect(transitions(sweep.boothIds)).toBe(1);
  });
});

// ─────────────────── UNIT C: planRoute 선택+정렬 통합 ───────────────────
describe("UNIT C — planRoute (선택 후 NN 정렬)", () => {
  const ranked = [
    scored(bd("a", 10, 0), 1.0),
    scored(bd("b", 20, 0), 0.9),
    scored(bd("c", 1000, 1000), 0.8),
  ];

  it("C1 출력 순서가 NN 스윕(= buildManualRoute)과 일치", () => {
    const plan = planRoute(ranked, {
      movementPreference: "thorough",
      availableMinutes: 600,
      start: START,
    });
    const selected = plan.boothIds.map(
      (id) => ranked.find((s) => s.booth.id === id)!.booth,
    );
    const reordered = buildManualRoute(selected, START);
    expect(plan.boothIds).toEqual(reordered.boothIds);
  });

  it("C2 인접 leg 연결성(from===이전 to), 시작은 start", () => {
    const plan = planRoute(ranked, {
      movementPreference: "balanced",
      availableMinutes: 600,
      start: START,
    });
    expect(plan.legs[0].from).toBe("start");
    for (let i = 1; i < plan.legs.length; i++) {
      expect(plan.legs[i].from).toBe(plan.legs[i - 1].to);
    }
  });

  it("C3 shortest는 thorough보다 적거나 같은 정거장", () => {
    const opts = { availableMinutes: 600, start: START } as const;
    const s = planRoute(ranked, { ...opts, movementPreference: "shortest" });
    const t = planRoute(ranked, { ...opts, movementPreference: "thorough" });
    expect(s.boothIds.length).toBeLessThanOrEqual(t.boothIds.length);
  });
});

// ─────────────────── UNIT D: buildOrderedRoute(순서 고정) ───────────────────
describe("UNIT D — buildOrderedRoute (재정렬 안 함)", () => {
  it("D1 주어진 순서를 그대로 보존(NN 정렬 안 함)", () => {
    const booths = [bd("z", 100, 0), bd("y", 10, 0), bd("x", 50, 0)];
    const r = buildOrderedRoute(booths, START);
    expect(r.boothIds).toEqual(["z", "y", "x"]); // 입력순 유지
  });
});
