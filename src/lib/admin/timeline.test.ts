import { describe, expect, it } from "vitest";
import {
  buildTimeline,
  groupEventsByDay,
  type TimelineEvent,
} from "./timeline";

describe("buildTimeline", () => {
  it("signal과 analytics를 최신순으로 병합한다", () => {
    const signals = [
      {
        id: "s1",
        userId: "u1",
        exhibitionId: "ex1",
        kind: "reaction_must" as const,
        boothCode: "A01",
        slugs: [],
        createdAt: "2026-08-08T10:00:00.000Z",
      },
    ];
    const analytics = [
      {
        id: "a1",
        sessionId: "sess1",
        exhibitionId: "ex1",
        type: "view" as const,
        boothId: "booth-1",
        createdAt: "2026-08-08T11:00:00.000Z",
      },
    ];
    const result = buildTimeline(
      signals,
      analytics,
      new Map([["u1", "닉네임1"]]),
      new Map([["A01", "부스A"]]),
      new Map([["booth-1", "부스B"]]),
    );
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("a1"); // 더 최신
    expect(result[0].userLabel).toBe("익명 세션");
    expect(result[0].boothLabel).toBe("부스B");
    expect(result[1].id).toBe("s1");
    expect(result[1].label).toBe("꼭 갈래");
    expect(result[1].userLabel).toBe("닉네임1");
    expect(result[1].boothLabel).toBe("부스A");
  });

  it("알 수 없는 kind/type은 원래 값을 그대로 라벨로 쓴다", () => {
    const result = buildTimeline(
      [
        {
          id: "s1",
          userId: "u1",
          exhibitionId: "ex1",
          // @ts-expect-error -- 미래에 추가될 수 있는 미지원 kind를 방어하는지 확인
          kind: "unknown_kind",
          slugs: [],
          createdAt: "2026-08-08T10:00:00.000Z",
        },
      ],
      [],
      new Map(),
      new Map(),
      new Map(),
    );
    expect(result[0].label).toBe("unknown_kind");
  });
});

describe("groupEventsByDay", () => {
  function ev(id: string, createdAt: string): TimelineEvent {
    return {
      id,
      createdAt,
      source: "signal",
      label: "테스트",
      userLabel: "사용자",
    };
  }

  it("같은 날 이벤트는 한 그룹으로 묶인다", () => {
    const groups = groupEventsByDay([
      ev("a", "2026-08-11T04:00:00Z"),
      ev("b", "2026-08-11T10:00:00Z"),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].events).toHaveLength(2);
  });

  it("날짜가 바뀌면 새 그룹이 생긴다", () => {
    const groups = groupEventsByDay([
      ev("a", "2026-08-11T09:00:00Z"),
      ev("b", "2026-08-10T09:00:00Z"),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0].events.map((e) => e.id)).toEqual(["a"]);
    expect(groups[1].events.map((e) => e.id)).toEqual(["b"]);
  });

  it("그룹 순서는 입력 순서를 그대로 따른다(재정렬 안 함)", () => {
    const groups = groupEventsByDay([
      ev("a", "2026-08-11T09:00:00Z"),
      ev("b", "2026-08-09T09:00:00Z"),
      ev("c", "2026-08-11T18:00:00Z"),
    ]);
    // b가 a보다 이전 날짜지만, 입력에서 a 다음에 나오는 c는 a와 같은 8/11 그룹으로
    // 다시 합쳐지지 않는다 — 인접한 같은 날짜만 묶는다(연속 구간 그루핑).
    expect(groups).toHaveLength(3);
  });

  it("빈 배열이면 빈 배열을 반환한다", () => {
    expect(groupEventsByDay([])).toEqual([]);
  });
});
