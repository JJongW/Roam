import { describe, expect, it } from "vitest";
import { classifyOutcome, buildOutcomeCards } from "./retro-outcomes";
import type { BoothNote } from "@/lib/types";

describe("classifyOutcome", () => {
  it("관심 있었고(must) 결과도 좋으면(good) 적중", () => {
    expect(classifyOutcome("must", "good")).toBe("hit");
  });
  it("관심 있었고(curious) 결과도 나쁘지 않으면(ok) 적중", () => {
    expect(classifyOutcome("curious", "ok")).toBe("hit");
  });
  it("패스했고(pass) 결과도 나쁘면(bad) 적중 — 패스가 옳았다", () => {
    expect(classifyOutcome("pass", "bad")).toBe("hit");
  });
  it("패스했는데(pass) 결과가 좋으면(good) 반전", () => {
    expect(classifyOutcome("pass", "good")).toBe("reversal");
  });
  it("관심 있었는데(must) 결과가 나쁘면(bad) 반전", () => {
    expect(classifyOutcome("must", "bad")).toBe("reversal");
  });
});

describe("buildOutcomeCards", () => {
  function note(overrides: Partial<BoothNote> & { boothId: string }): BoothNote {
    return {
      userId: "u1",
      updatedAt: "2026-08-11T00:00:00Z",
      ...overrides,
    };
  }

  const names = { b1: "부스1", b2: "부스2", b3: "부스3", b4: "부스4", b5: "부스5" };

  it("interest·verdict 둘 다 있는 노트만 카드로 만든다", () => {
    const notes = [
      note({ boothId: "b1", interest: "must", verdict: "good" }),
      note({ boothId: "b2", interest: "must" }), // verdict 없음 — 제외
      note({ boothId: "b3", verdict: "good" }), // interest 없음 — 제외
    ];
    const cards = buildOutcomeCards(notes, names);
    expect(cards).toHaveLength(1);
    expect(cards[0]).toEqual({
      boothId: "b1",
      boothName: "부스1",
      interest: "must",
      verdict: "good",
      kind: "hit",
    });
  });

  it("judgedClass=confident인 카드를 먼저 배치한다", () => {
    const notes = [
      note({ boothId: "b1", interest: "must", verdict: "good", judgedClass: "uncertain" }),
      note({ boothId: "b2", interest: "must", verdict: "good", judgedClass: "confident" }),
    ];
    const cards = buildOutcomeCards(notes, names);
    expect(cards.map((c) => c.boothId)).toEqual(["b2", "b1"]);
  });

  it("limit개까지만 반환한다(기본 4)", () => {
    const notes = ["b1", "b2", "b3", "b4", "b5"].map((id) =>
      note({ boothId: id, interest: "must", verdict: "good" }),
    );
    expect(buildOutcomeCards(notes, names)).toHaveLength(4);
    expect(buildOutcomeCards(notes, names, 2)).toHaveLength(2);
  });

  it("대상이 없으면 빈 배열", () => {
    expect(buildOutcomeCards([], names)).toEqual([]);
  });
});
