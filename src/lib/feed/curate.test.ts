import { describe, expect, it } from "vitest";
import { decidedBoothIds, positiveNotes } from "./curate";

describe("decidedBoothIds", () => {
  it("interest·verdict 어느 쪽이든 있으면 제외 대상", () => {
    const ids = decidedBoothIds([
      { boothId: "b1", interest: "must", verdict: undefined },
      { boothId: "b2", interest: undefined, verdict: "bad" },
      { boothId: "b3", interest: undefined, verdict: undefined },
    ]);
    expect(ids.has("b1")).toBe(true);
    expect(ids.has("b2")).toBe(true);
    expect(ids.has("b3")).toBe(false);
  });
});

describe("positiveNotes — bad는 절대 근거로 안 쓴다", () => {
  it("verdict='bad'는 제외된다", () => {
    const r = positiveNotes([
      {
        boothId: "b1",
        interest: undefined,
        verdict: "bad",
        updatedAt: "2026-01-01",
      },
    ]);
    expect(r).toHaveLength(0);
  });

  it("verdict='good'은 kind='good'으로 포함된다", () => {
    const r = positiveNotes([
      {
        boothId: "b1",
        interest: undefined,
        verdict: "good",
        updatedAt: "2026-01-01",
      },
    ]);
    expect(r).toEqual([{ boothId: "b1", kind: "good" }]);
  });

  it("interest='must'|'curious'도 포함된다", () => {
    const r = positiveNotes([
      {
        boothId: "b1",
        interest: "must",
        verdict: undefined,
        updatedAt: "2026-01-01",
      },
      {
        boothId: "b2",
        interest: "curious",
        verdict: undefined,
        updatedAt: "2026-01-02",
      },
    ]);
    expect(r.map((x) => x.kind).sort()).toEqual(["curious", "must"]);
  });

  it("최신순 정렬", () => {
    const r = positiveNotes([
      {
        boothId: "old",
        interest: "must",
        verdict: undefined,
        updatedAt: "2026-01-01",
      },
      {
        boothId: "new",
        interest: "must",
        verdict: undefined,
        updatedAt: "2026-01-02",
      },
    ]);
    expect(r[0].boothId).toBe("new");
  });

  it("interest='pass'는 근거가 아니다", () => {
    const r = positiveNotes([
      {
        boothId: "b1",
        interest: "pass",
        verdict: undefined,
        updatedAt: "2026-01-01",
      },
    ]);
    expect(r).toHaveLength(0);
  });

  it("interest='must'+verdict='bad'는 verdict가 이겨서 제외된다 (judgment-vocabulary 최종 리뷰 Fix 2 회귀)", () => {
    const r = positiveNotes([
      {
        boothId: "b1",
        interest: "must",
        verdict: "bad",
        updatedAt: "2026-01-01",
      },
    ]);
    expect(r).toHaveLength(0);
  });

  it("interest='must'+verdict='ok'도 제외된다 — verdict가 있으면 interest는 안 본다", () => {
    const r = positiveNotes([
      {
        boothId: "b1",
        interest: "must",
        verdict: "ok",
        updatedAt: "2026-01-01",
      },
    ]);
    expect(r).toHaveLength(0);
  });
});
