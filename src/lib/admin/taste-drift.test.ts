import { describe, expect, it } from "vitest";
import { tasteDrift } from "./taste-drift";
import type { BoothListItem, Exhibition, UserSignal } from "@/lib/types";

function ex(id: string, startDate: string, name = id): Exhibition {
  return {
    id, slug: id, name, venue: "", description: "",
    startDate, endDate: startDate, mapWidth: 0, mapHeight: 0,
    tips: {}, createdAt: "2026-01-01T00:00:00Z",
  } as Exhibition;
}

function sig(userId: string, exhibitionId: string, slugs: string[]): UserSignal {
  return {
    id: `${userId}-${exhibitionId}-${slugs.join("")}-${Math.random()}`,
    userId, exhibitionId, kind: "reaction_must", slugs,
    createdAt: "2026-01-01T00:00:00Z",
  };
}

/** 같은 사용자가 두 전시에 남긴 신호 n건씩. */
function repeat(user: string, exId: string, slugs: string[], n: number) {
  return Array.from({ length: n }, () => sig(user, exId, slugs));
}

describe("tasteDrift — 관객 구성 교란 제거", () => {
  it("한 전시에만 온 사람은 코호트에서 뺀다", () => {
    // e2에만 온 사람이 goods를 잔뜩 눌러도 이동으로 잡히면 안 된다.
    const d = tasteDrift([
      { exhibition: ex("e1", "2026-01-01"), signals: repeat("u1", "e1", ["discovery"], 10) },
      {
        exhibition: ex("e2", "2026-02-01"),
        signals: [
          ...repeat("u1", "e2", ["discovery"], 10),
          ...repeat("oneshot", "e2", ["goods"], 100),
        ],
      },
    ]);
    expect(d.cohort).toBe(1);
    // u1은 안 변했으므로 movers가 비어야 한다.
    expect(d.movers).toEqual([]);
  });

  it("같은 사람의 비중이 옮겨가면 그게 잡힌다", () => {
    const d = tasteDrift([
      {
        exhibition: ex("e1", "2026-01-01"),
        signals: [...repeat("u1", "e1", ["goods"], 8), ...repeat("u1", "e1", ["discovery"], 2)],
      },
      {
        exhibition: ex("e2", "2026-02-01"),
        signals: [...repeat("u1", "e2", ["goods"], 2), ...repeat("u1", "e2", ["discovery"], 8)],
      },
    ]);
    const discovery = d.movers.find((m) => m.slug === "discovery")!;
    expect(discovery.fromPct).toBe(20);
    expect(discovery.toPct).toBe(80);
    expect(discovery.deltaPct).toBe(60);
  });
});

describe("tasteDrift — 가치 축만 본다", () => {
  it("분야 slug은 전시마다 namespace가 달라 비교에서 뺀다", () => {
    const d = tasteDrift([
      { exhibition: ex("e1", "2026-01-01"), signals: repeat("u1", "e1", ["lit", "discovery"], 5) },
      { exhibition: ex("e2", "2026-02-01"), signals: repeat("u1", "e2", ["collect", "discovery"], 5) },
    ]);
    for (const s of d.slices) expect(Object.keys(s.bias)).toEqual(["discovery"]);
  });
});

describe("tasteDrift — 전시 성격을 나눠낸다", () => {
  it("전시가 제공하는 만큼 고른 건 이동이 아니다", () => {
    // 도서전엔 학습 부스가 많고 홈페어엔 체험 부스가 많다. 같은 사람이 각
    // 전시에서 "있는 만큼" 골랐다면 취향은 안 변한 것이다.
    const booths = (slug: string, n: number): BoothListItem[] =>
      Array.from({ length: n }, (_, i) => ({
        id: `b${slug}${i}`, exhibitionId: "e", hallId: "h", categoryId: "c",
        name: "b", company: "b", description: "", tags: [], x: 0, y: 0,
        popularity: 50, createdAt: "2026-01-01T00:00:00Z",
        valueTags: [{ slug, strength: 1 }],
      })) as unknown as BoothListItem[];

    const d = tasteDrift([
      {
        exhibition: ex("e1", "2026-01-01"),
        signals: repeat("u1", "e1", ["learning"], 30),
        booths: booths("learning", 10),
      },
      {
        exhibition: ex("e2", "2026-02-01"),
        signals: repeat("u1", "e2", ["experience"], 30),
        booths: booths("experience", 10),
      },
    ]);
    // 둘 다 편향 0 — 전시가 준 만큼 골랐을 뿐이다.
    for (const s of d.slices) {
      for (const v of Object.values(s.bias)) expect(Math.abs(v)).toBeLessThan(0.01);
    }
    expect(d.movers).toEqual([]);
  });

  it("부스 가치 태그가 없으면 보정을 못 했다고 말한다", () => {
    const d = tasteDrift([
      { exhibition: ex("e1", "2026-01-01"), signals: repeat("u1", "e1", ["goods"], 30) },
      { exhibition: ex("e2", "2026-02-01"), signals: repeat("u1", "e2", ["discovery"], 30) },
    ]);
    expect(d.slices.every((s) => s.unadjusted)).toBe(true);
  });
});

describe("tasteDrift — 과대 해석 방지", () => {
  it("재방문자가 적으면 경향으로 읽지 말라고 한다", () => {
    const d = tasteDrift([
      { exhibition: ex("e1", "2026-01-01"), signals: repeat("u1", "e1", ["goods"], 30) },
      { exhibition: ex("e2", "2026-02-01"), signals: repeat("u1", "e2", ["discovery"], 30) },
    ]);
    expect(d.note).toContain("개인차에 가깝다");
  });

  it("두 전시에 걸친 사용자가 없으면 그렇게 말한다", () => {
    const d = tasteDrift([
      { exhibition: ex("e1", "2026-01-01"), signals: repeat("u1", "e1", ["goods"], 5) },
      { exhibition: ex("e2", "2026-02-01"), signals: repeat("u2", "e2", ["goods"], 5) },
    ]);
    expect(d.cohort).toBe(0);
    expect(d.note).toContain("이동을 볼 수 없다");
  });
});
