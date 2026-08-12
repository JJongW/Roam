import { describe, expect, it } from "vitest";
import {
  findBoothEnrichmentGaps,
  findNoteInconsistencies,
} from "./data-issues";
import type { Booth, BoothNote } from "@/lib/types";

function booth(
  overrides: Partial<Booth> & { id: string; name: string },
): Booth {
  return {
    exhibitionId: "ex-1",
    kind: "exhibitor",
    categoryId: "cat-1",
    tags: [],
    aliases: [],
    ...overrides,
  } as Booth;
}

describe("findBoothEnrichmentGaps", () => {
  it("최소 필수 6종이 다 채워진 부스는 결측 없음", () => {
    const b = booth({
      id: "b1",
      name: "부스1",
      enrichment: {
        goodsKeywords: [],
        themeTags: [],
        summary: "요약",
        valueTags: [{ slug: "discovery", strength: 1 }],
        recommendationReasons: { discovery: "이유" },
        thingsToDo: ["신간 훑기"],
        timing: ["오전 붐빔"],
        memoryHooks: ["기억 단서"],
      },
    });
    expect(findBoothEnrichmentGaps([b])).toEqual([]);
  });

  it("enrichment 자체가 없으면 6종 전부 결측", () => {
    const b = booth({ id: "b2", name: "부스2" });
    const gaps = findBoothEnrichmentGaps([b]);
    expect(gaps).toHaveLength(1);
    expect(gaps[0].missingFields).toEqual([
      "summary",
      "valueTags",
      "recommendationReasons",
      "thingsToDo",
      "timing",
      "memoryHooks",
    ]);
  });

  it("빈 배열/빈 객체/빈 문자열도 결측으로 센다", () => {
    const b = booth({
      id: "b3",
      name: "부스3",
      enrichment: {
        goodsKeywords: [],
        themeTags: [],
        summary: "",
        valueTags: [],
        recommendationReasons: {},
        thingsToDo: [],
        timing: ["오전 붐빔"],
        memoryHooks: ["기억 단서"],
      },
    });
    const gaps = findBoothEnrichmentGaps([b]);
    expect(gaps[0].missingFields).toEqual([
      "summary",
      "valueTags",
      "recommendationReasons",
      "thingsToDo",
    ]);
  });

  it("결측 필드 수가 많은 부스가 먼저 온다", () => {
    const few = booth({
      id: "b4",
      name: "결측적음",
      enrichment: {
        goodsKeywords: [],
        themeTags: [],
        summary: "요약",
        valueTags: [{ slug: "discovery", strength: 1 }],
        recommendationReasons: { discovery: "이유" },
        thingsToDo: ["할 일"],
      },
    });
    const many = booth({ id: "b5", name: "결측많음" });
    const gaps = findBoothEnrichmentGaps([few, many]);
    expect(gaps[0].boothId).toBe("b5");
    expect(gaps[1].boothId).toBe("b4");
  });
});

describe("findNoteInconsistencies", () => {
  function note(
    overrides: Partial<BoothNote> & { userId: string; boothId: string },
  ): BoothNote {
    return { updatedAt: "2026-08-11T00:00:00Z", ...overrides } as BoothNote;
  }

  it("verdict가 있는데 visitedAt이 없으면 플래그", () => {
    const notes = [note({ userId: "u1", boothId: "b1", verdict: "good" })];
    const issues = findNoteInconsistencies(notes);
    expect(issues).toEqual([
      { userId: "u1", boothId: "b1", reason: "verdict_without_visitedAt" },
    ]);
  });

  it("정상 레코드는 플래그 없음", () => {
    const notes = [
      note({
        userId: "u1",
        boothId: "b1",
        verdict: "good",
        visitedAt: "2026-08-11T00:00:00Z",
      }),
    ];
    expect(findNoteInconsistencies(notes)).toEqual([]);
  });
});
