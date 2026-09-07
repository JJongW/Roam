import { describe, expect, it } from "vitest";
import { rejectionsByBooth, exhibitionLessons } from "./lessons";
import type { EnrichmentCandidate } from "@/lib/types";

function rej(boothId: string, reviewNote: string | null): EnrichmentCandidate {
  return {
    id: `c_${boothId}_${reviewNote ?? "x"}`,
    boothId,
    exhibitionId: "e1",
    source: "drafter",
    payload: {},
    sources: [],
    confidence: 0.5,
    issues: [],
    status: "rejected",
    reviewNote,
    createdAt: "2026-09-06T00:00:00Z",
  };
}

describe("rejectionsByBooth", () => {
  it("부스별로 사유를 모은다", () => {
    const m = rejectionsByBooth([
      rej("b1", "사실이 틀렸다 — 2024년 브랜드다"),
      rej("b2", "로미 말투가 아니다"),
    ]);
    expect(m.get("b1")).toEqual(["사실이 틀렸다 — 2024년 브랜드다"]);
    expect(m.get("b2")).toEqual(["로미 말투가 아니다"]);
  });

  it("사유 없는 반려는 재료가 아니다", () => {
    expect(rejectionsByBooth([rej("b1", null)]).size).toBe(0);
  });

  it("같은 부스의 같은 지적은 한 번만 넣는다", () => {
    const m = rejectionsByBooth([rej("b1", "두루뭉술하다"), rej("b1", "두루뭉술하다")]);
    expect(m.get("b1")).toHaveLength(1);
  });
});

describe("exhibitionLessons", () => {
  it("서로 다른 부스에서 반복된 지적만 전시 지침이 된다", () => {
    const lessons = exhibitionLessons([
      rej("b1", "근거 없이 지어냈다 — 수상 이력 없음"),
      rej("b2", "근거 없이 지어냈다 — 협업 사실 아님"),
      rej("b3", "로미 말투가 아니다"),
    ]);
    expect(lessons).toEqual(["근거 없이 지어냈다"]);
  });

  it("한 부스에서 여러 번 반려된 건 전시 지침이 아니다", () => {
    // 그 부스 문제지 전시 전체의 경향이 아니다 — 과잉일반화를 막는다.
    const lessons = exhibitionLessons([
      rej("b1", "사실이 틀렸다 — A"),
      rej("b1", "사실이 틀렸다 — B"),
      rej("b1", "사실이 틀렸다 — C"),
    ]);
    expect(lessons).toEqual([]);
  });

  it("많이 반복된 지적이 앞에 온다", () => {
    const lessons = exhibitionLessons([
      rej("b1", "두루뭉술하다"),
      rej("b2", "두루뭉술하다"),
      rej("b3", "두루뭉술하다"),
      rej("b4", "로미 말투가 아니다"),
      rej("b5", "로미 말투가 아니다"),
    ]);
    expect(lessons[0]).toBe("두루뭉술하다");
  });
});
