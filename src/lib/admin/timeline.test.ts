import { describe, expect, it } from "vitest";
import { buildTimeline } from "./timeline";

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
