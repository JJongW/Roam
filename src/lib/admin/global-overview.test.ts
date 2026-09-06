import { describe, expect, it } from "vitest";
import { buildGlobalOverview } from "./global-overview";
import type { Exhibition, User, UserSignal } from "@/lib/types";

function ex(id: string, startDate: string): Exhibition {
  return {
    id,
    slug: id,
    name: id.toUpperCase(),
    venue: "코엑스",
    description: "",
    startDate,
    endDate: startDate,
    mapWidth: 1000,
    mapHeight: 800,
    tips: {},
    createdAt: "2026-01-01T00:00:00Z",
  } as Exhibition;
}

function sig(userId: string, exhibitionId: string, slugs: string[] = []): UserSignal {
  return {
    id: `s_${userId}_${exhibitionId}_${slugs.join("")}`,
    userId,
    exhibitionId,
    kind: "reaction_must",
    slugs,
    createdAt: "2026-08-12T00:00:00Z",
  };
}

const users: User[] = [
  { id: "u1", nickname: "a", createdAt: "2026-01-01T00:00:00Z" },
  { id: "u2", nickname: "b", createdAt: "2026-01-01T00:00:00Z" },
  { id: "u3", nickname: "c", createdAt: "2026-01-01T00:00:00Z" },
];

describe("buildGlobalOverview", () => {
  it("멀티 전시 비율의 분모는 총 사용자가 아니라 활성 사용자다", () => {
    // u1은 두 전시 모두, u2는 한 전시만, u3는 가입만 하고 신호 없음.
    const out = buildGlobalOverview(users, [
      {
        exhibition: ex("e1", "2026-06-01"),
        boothCount: 10,
        signals: [sig("u1", "e1", ["discovery", "goods"]), sig("u2", "e1")],
      },
      {
        exhibition: ex("e2", "2026-09-01"),
        boothCount: 4,
        signals: [sig("u1", "e2", ["discovery", "rest"])],
      },
    ]);

    expect(out.totalUsers).toBe(3);
    expect(out.activeUsers).toBe(2);
    expect(out.multiExhibitionUsers).toBe(1);
    expect(out.multiExhibitionRatio).toBe(0.5);

    // 가치는 전 전시 합산 — discovery가 두 전시에서 한 번씩.
    expect(out.values[0]).toEqual({ slug: "discovery", count: 2 });

    // 포트폴리오는 최근 시작 전시가 위, 방문자는 전시별 고유 사용자.
    expect(out.portfolio.map((p) => p.id)).toEqual(["e2", "e1"]);
    expect(out.portfolio[0].visitorCount).toBe(1);
    expect(out.portfolio[1].visitorCount).toBe(2);
  });

  it("신호가 하나도 없어도 0으로 나눈 NaN을 내지 않는다", () => {
    const out = buildGlobalOverview(users, [
      { exhibition: ex("e1", "2026-06-01"), boothCount: 0, signals: [] },
    ]);
    expect(out.multiExhibitionRatio).toBe(0);
    expect(out.values).toEqual([]);
  });
});
