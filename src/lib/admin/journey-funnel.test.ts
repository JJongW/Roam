import { describe, expect, it } from "vitest";
import { computeJourneyFunnel } from "./journey-funnel";
import type { UserSignal } from "@/lib/types";

function sig(
  overrides: Partial<UserSignal> & { userId: string; kind: UserSignal["kind"] },
): UserSignal {
  return {
    id: `s_${Math.random()}`,
    exhibitionId: "e1",
    slugs: [],
    createdAt: "2026-08-12T00:00:00Z",
    ...overrides,
  };
}

describe("computeJourneyFunnel", () => {
  it("가치 온보딩 신호(boothCode 없는 reaction_must)와 피드 반응(boothCode 있는)을 구분한다", () => {
    const signals: UserSignal[] = [
      // u1: 온보딩만 함(boothCode 없음)
      sig({
        userId: "u1",
        kind: "reaction_must",
        slugs: ["discovery", "social"],
      }),
      // u2: 온보딩 + 실제 부스 반응
      sig({
        userId: "u2",
        kind: "reaction_must",
        slugs: ["discovery", "social"],
      }),
      sig({ userId: "u2", kind: "reaction_curious", boothCode: "A01" }),
    ];
    const result = computeJourneyFunnel(signals, new Set());
    const onboarded = result.find((s) => s.stage === "가치 온보딩 완료")!;
    const reacted = result.find((s) => s.stage === "피드 반응")!;
    expect(onboarded.count).toBe(2); // u1, u2 둘 다 온보딩 신호가 있음
    expect(reacted.count).toBe(1); // u2만 실제 부스 반응
  });

  it("판정(verdict_*)과 회고(reflectedUserIds)를 각각 센다", () => {
    const signals: UserSignal[] = [
      sig({ userId: "u1", kind: "reaction_must" }),
      sig({ userId: "u1", kind: "verdict_good", boothCode: "A01" }),
    ];
    const result = computeJourneyFunnel(signals, new Set(["u1"]));
    expect(result.find((s) => s.stage === "현장 판정")!.count).toBe(1);
    expect(result.find((s) => s.stage === "관람 마치기")!.count).toBe(1);
  });

  it("첫 단계(전시 진입)는 신호 종류 무관하게 모든 distinct 사용자", () => {
    const signals: UserSignal[] = [
      sig({ userId: "u1", kind: "search_query" }),
      sig({ userId: "u2", kind: "booth_bookmarked" }),
    ];
    const result = computeJourneyFunnel(signals, new Set());
    expect(result.find((s) => s.stage === "전시 진입")!.count).toBe(2);
  });

  it("전환율은 직전 단계 대비다 — 1단계 대비가 아니다", () => {
    const signals: UserSignal[] = [
      sig({ userId: "u1", kind: "reaction_must" }),
      sig({ userId: "u2", kind: "reaction_must" }),
      sig({ userId: "u1", kind: "verdict_good", boothCode: "A01" }),
    ];
    const result = computeJourneyFunnel(signals, new Set());
    const judged = result.find((s) => s.stage === "현장 판정")!;
    const reacted = result.find((s) => s.stage === "피드 반응")!;
    // 피드 반응(0명, 아무도 boothCode 있는 반응 안 함) 대비 판정(1명)이면 0으로 나눠지지 않고 0%.
    expect(reacted.count).toBe(0);
    expect(judged.rate).toBe(0);
  });

  it("같은 사용자가 같은 단계 신호를 여러 번 남겨도 1명으로 센다", () => {
    const signals: UserSignal[] = [
      sig({ userId: "u1", kind: "verdict_good", boothCode: "A01" }),
      sig({ userId: "u1", kind: "verdict_ok", boothCode: "A02" }),
    ];
    const result = computeJourneyFunnel(signals, new Set());
    expect(result.find((s) => s.stage === "현장 판정")!.count).toBe(1);
  });

  it("신호도 회고도 없으면 전부 0", () => {
    const result = computeJourneyFunnel([], new Set());
    expect(result.every((s) => s.count === 0)).toBe(true);
  });

  it("boothCode 없어도 slug가 1개뿐이면 온보딩으로 안 센다 — brain-sheet 재시드 오탐 방지", () => {
    const signals: UserSignal[] = [
      sig({ userId: "u1", kind: "reaction_must", slugs: ["discovery"] }),
    ];
    const result = computeJourneyFunnel(signals, new Set());
    expect(result.find((s) => s.stage === "가치 온보딩 완료")!.count).toBe(0);
  });
});
