import { describe, expect, it } from "vitest";
import { crossTasteBehavior } from "./taste-behavior";
import type { AnalyticsEvent, Booth, UserBrain } from "@/lib/types";

function brain(userId: string, interests: [string, number][]): UserBrain {
  return {
    userId,
    version: 1,
    updatedAt: "2026-09-01T00:00:00.000Z",
    literacy: { overall: 0, byTheme: {}, visitsCount: 0, boothsSeenCount: 0 },
    interests: interests.map(([key, confidence]) => ({
      key,
      label: key,
      confidence,
    })),
  } as UserBrain;
}

function booth(id: string, valueSlugs: string[]): Booth {
  return {
    id,
    name: id,
    tags: valueSlugs,
    valueTags: valueSlugs.map((slug) => ({ slug, label: slug })),
  } as unknown as Booth;
}

function ev(id: string, userId: string | undefined, boothId?: string) {
  return {
    id,
    sessionId: "s",
    userId,
    exhibitionId: "ex1",
    type: "view",
    boothId,
    createdAt: "2026-09-01T00:00:00.000Z",
  } as AnalyticsEvent;
}

describe("crossTasteBehavior", () => {
  it("취향을 가진 사용자의 이벤트만 그 가치에 붙인다", () => {
    const { rows } = crossTasteBehavior(
      [brain("u1", [["goods", 0.8]]), brain("u2", [["rest", 0.9]])],
      [ev("a1", "u1", "b1"), ev("a2", "u1", "b1"), ev("a3", "u2", "b2")],
      [booth("b1", ["goods"]), booth("b2", ["rest"])],
    );
    const goods = rows.find((r) => r.slug === "goods")!;
    expect(goods.booths).toEqual([
      { boothId: "b1", events: 2, users: 1, tagged: true },
    ]);
    const rest = rows.find((r) => r.slug === "rest")!;
    expect(rest.booths).toEqual([
      { boothId: "b2", events: 1, users: 1, tagged: true },
    ]);
  });

  it("가치 태그가 없는 부스를 본 경우 tagged=false로 표시한다", () => {
    const { rows } = crossTasteBehavior(
      [brain("u1", [["goods", 0.8]])],
      [ev("a1", "u1", "b9")],
      [booth("b9", ["rest"])],
    );
    expect(rows[0].booths[0]).toMatchObject({ boothId: "b9", tagged: false });
  });

  it("user_id 없는 이벤트는 unattributed로 센다", () => {
    const { rows, unattributed } = crossTasteBehavior(
      [brain("u1", [["goods", 0.8]])],
      [ev("a1", undefined, "b1"), ev("a2", "u1", "b1")],
      [booth("b1", ["goods"])],
    );
    expect(unattributed).toBe(1);
    expect(rows[0].booths[0].events).toBe(1);
  });

  it("confidence가 임계 미만인 관심은 취향으로 세지 않는다", () => {
    const { rows } = crossTasteBehavior(
      [brain("u1", [["goods", 0.05]])],
      [ev("a1", "u1", "b1")],
      [booth("b1", ["goods"])],
    );
    expect(rows).toHaveLength(0);
  });

  it("8가치가 아닌 분야 slug 노드는 취향 축에서 제외한다", () => {
    const { rows } = crossTasteBehavior(
      [brain("u1", [["illustration", 0.9]])],
      [ev("a1", "u1", "b1")],
      [booth("b1", ["illustration"])],
    );
    expect(rows).toHaveLength(0);
  });

  it("행동 기록이 없는 취향도 tasteUsers로는 남는다(activeUsers=0)", () => {
    const { rows } = crossTasteBehavior(
      [brain("u1", [["goods", 0.8]])],
      [],
      [booth("b1", ["goods"])],
    );
    expect(rows[0]).toMatchObject({
      slug: "goods",
      tasteUsers: 1,
      activeUsers: 0,
      booths: [],
    });
  });
});
