import { describe, expect, it } from "vitest";
import { computeFlowEdges } from "./flow";
import type { AnalyticsEvent } from "@/lib/types";

function view(
  sessionId: string,
  boothId: string,
  minutesFromZero: number,
  userId?: string,
): AnalyticsEvent {
  return {
    id: `${sessionId}-${boothId}-${minutesFromZero}`,
    sessionId,
    userId,
    exhibitionId: "ex1",
    type: "view",
    boothId,
    createdAt: new Date(
      Date.UTC(2026, 8, 1, 0, minutesFromZero),
    ).toISOString(),
  } as AnalyticsEvent;
}

describe("computeFlowEdges", () => {
  it("같은 세션에서 연달아 본 부스를 엣지로 잇는다", () => {
    const edges = computeFlowEdges([
      view("s1", "b1", 0),
      view("s1", "b2", 5),
      view("s1", "b3", 10),
    ]);
    expect(edges).toEqual([
      { from: "b1", to: "b2", count: 1 },
      { from: "b2", to: "b3", count: 1 },
    ]);
  });

  it("세션이 갈려도 같은 user_id면 이어붙인다", () => {
    const edges = computeFlowEdges([
      view("s1", "b1", 0, "u1"),
      view("s2", "b2", 5, "u1"), // 기기가 바뀐 같은 사람
    ]);
    expect(edges).toEqual([{ from: "b1", to: "b2", count: 1 }]);
  });

  it("user_id가 다르면 세션이 같아도 잇지 않는다", () => {
    const edges = computeFlowEdges([
      view("s1", "b1", 0, "u1"),
      view("s1", "b2", 5, "u2"),
    ]);
    expect(edges).toEqual([]);
  });

  it("30분을 넘겨 벌어진 이벤트는 다른 관람으로 보고 끊는다", () => {
    const edges = computeFlowEdges([
      view("s1", "b1", 0),
      view("s1", "b2", 31),
    ]);
    expect(edges).toEqual([]);
  });

  it("같은 부스 연속 조회와 view가 아닌 이벤트는 무시한다", () => {
    const edges = computeFlowEdges([
      view("s1", "b1", 0),
      view("s1", "b1", 2),
      { ...view("s1", "b2", 4), type: "ui_click" } as AnalyticsEvent,
      view("s1", "b3", 6),
    ]);
    expect(edges).toEqual([{ from: "b1", to: "b3", count: 1 }]);
  });

  it("같은 전이가 반복되면 count로 합산한다", () => {
    const edges = computeFlowEdges([
      view("s1", "b1", 0),
      view("s1", "b2", 2),
      view("s2", "b1", 0),
      view("s2", "b2", 3),
    ]);
    expect(edges).toEqual([{ from: "b1", to: "b2", count: 2 }]);
  });
});
