import { describe, expect, it } from "vitest";
import { learningCurve } from "./learning-curve";
import type { CurveInput } from "./learning-curve";

function row(
  userId: string,
  exhibitionId: string,
  at: string,
  judged: boolean,
  hit = true,
): CurveInput {
  return {
    userId,
    exhibitionId,
    at,
    interest: judged ? "must" : "curious",
    verdict: judged ? (hit ? "good" : "bad") : null,
    judgedClass: judged ? "confident" : null,
  };
}

/** 한 사용자·한 전시에 판정 n건. 정확도 임계(5건)를 넘기려면 필요하다. */
function batch(
  user: string,
  ex: string,
  at: string,
  n: number,
  hit: boolean,
): CurveInput[] {
  return Array.from({ length: n }, () => row(user, ex, at, true, hit));
}

describe("learningCurve — 회차 매기기", () => {
  it("회차는 전시 개최 순이 아니라 그 사용자의 방문 순서다", () => {
    // u1은 e2를 먼저 봤다 — u1에게 e2가 1회차다.
    const c = learningCurve([
      ...batch("u1", "e2", "2026-01-10", 5, true),
      ...batch("u1", "e1", "2026-02-10", 5, true),
      ...batch("u2", "e1", "2026-01-05", 5, true),
    ]);
    expect(c.points.map((p) => p.ordinal)).toEqual([1, 2]);
    // 1회차엔 u1(e2)·u2(e1) 둘 다.
    expect(c.points[0].users).toBe(2);
    expect(c.points[1].users).toBe(1);
  });

  it("판정 없는 반응은 채점에서 빠진다", () => {
    const c = learningCurve([
      row("u1", "e1", "2026-01-01", false),
      row("u1", "e1", "2026-01-02", false),
    ]);
    expect(c.points[0].judgedCount).toBe(0);
    expect(c.points[0].pct).toBeNull();
  });
});

describe("learningCurve — 곡선", () => {
  it("회차가 늘수록 정확해지면 그게 보인다", () => {
    const c = learningCurve([
      ...batch("u1", "e1", "2026-01-01", 20, true),
      ...batch("u1", "e1", "2026-01-01", 20, false),
      ...batch("u1", "e2", "2026-02-01", 40, true),
    ]);
    expect(c.blocker).toBeNull();
    expect(c.points[1].pct!).toBeGreaterThan(c.points[0].pct!);
    expect(c.points.every((p) => !p.thin)).toBe(true);
  });

  it("표본이 얇으면 숫자가 나와도 추세로 읽지 말라고 한다", () => {
    // 운영 실측(2026-09-07): 1회차 265건 · 2회차 12건. 그대로 두면
    // "54% → 70%, 로미가 학습한다"로 읽힌다.
    const c = learningCurve([
      ...batch("u1", "e1", "2026-01-01", 40, true),
      ...batch("u1", "e2", "2026-02-01", 6, true),
    ]);
    expect(c.points[1].thin).toBe(true);
    expect(c.blocker).toContain("아직 추세가 아니다");
    expect(c.blocker).toContain("저작 데이터 품질");
  });
});

describe("learningCurve — 공백을 설명한다", () => {
  it("2회차 방문자가 없으면 그렇게 말한다", () => {
    const c = learningCurve(batch("u1", "e1", "2026-01-01", 5, true));
    expect(c.blocker).toContain("두 번째 전시에 반응한 사용자가 아직 없다");
  });

  it("2회차에 반응은 있는데 판정이 없으면 그걸 짚는다", () => {
    // 운영에서 실제로 이 상태였다(2026-09-07): 재방문은 하는데 관람을 안 마친다.
    const c = learningCurve([
      ...batch("u1", "e1", "2026-01-01", 5, true),
      row("u1", "e2", "2026-02-01", false),
      row("u1", "e2", "2026-02-02", false),
    ]);
    expect(c.blocker).toContain("판정");
    expect(c.blocker).toContain("관람을 마치지 않으면");
  });

  it("2회차 판정이 임계 미만이면 몇 건 모자란지 말한다", () => {
    const c = learningCurve([
      ...batch("u1", "e1", "2026-01-01", 5, true),
      ...batch("u1", "e2", "2026-02-01", 2, true),
    ]);
    expect(c.blocker).toContain("2건뿐");
  });
});
