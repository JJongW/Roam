import { describe, expect, it } from "vitest";
import { createLinkPicker, decidedBoothIds, positiveNotes } from "./curate";
import type { Booth } from "@/lib/types";

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

describe("createLinkPicker — 근거 링크는 최대 N회, 서로 다른 부스를 인용", () => {
  function taggedBooth(id: string, slug: string): Booth {
    return {
      id,
      exhibitionId: "e1",
      hallId: "h1",
      categoryId: "c1",
      name: `부스-${id}`,
      company: `회사-${id}`,
      description: "",
      longDescription: "",
      images: [],
      tags: [slug],
      x: 0,
      y: 0,
      popularity: 0,
    } as unknown as Booth;
  }

  it("겹치는 가치의 과거 긍정 반응이 있으면 링크를 만든다", () => {
    const past = taggedBooth("past1", "discovery");
    const candidate = taggedBooth("cand1", "discovery");
    const pick = createLinkPicker([{ booth: past, kind: "must" }]);
    expect(pick(candidate)).toEqual({ name: "부스-past1", kind: "must" });
  });

  it("겹치는 가치가 없으면 링크를 안 만든다 — 억지 근거 금지", () => {
    const past = taggedBooth("past1", "discovery");
    const candidate = taggedBooth("cand1", "social");
    const pick = createLinkPicker([{ booth: past, kind: "must" }]);
    expect(pick(candidate)).toBeUndefined();
  });

  it("기본 최대 2회까지만 링크를 만들고, 그 다음부턴 undefined", () => {
    const past1 = taggedBooth("past1", "discovery");
    const past2 = taggedBooth("past2", "discovery");
    const past3 = taggedBooth("past3", "discovery");
    const pick = createLinkPicker([
      { booth: past1, kind: "must" },
      { booth: past2, kind: "curious" },
      { booth: past3, kind: "good" },
    ]);
    const c1 = taggedBooth("cand1", "discovery");
    const c2 = taggedBooth("cand2", "discovery");
    const c3 = taggedBooth("cand3", "discovery");
    expect(pick(c1)).toBeDefined();
    expect(pick(c2)).toBeDefined();
    expect(pick(c3)).toBeUndefined();
  });

  it("이미 인용한 과거 부스는 다시 인용하지 않는다 — 서로 다른 부스로", () => {
    const past1 = taggedBooth("past1", "discovery");
    const past2 = taggedBooth("past2", "discovery");
    const pick = createLinkPicker([
      { booth: past1, kind: "must" },
      { booth: past2, kind: "curious" },
    ]);
    const c1 = taggedBooth("cand1", "discovery");
    const c2 = taggedBooth("cand2", "discovery");
    const first = pick(c1);
    const second = pick(c2);
    expect(first?.name).not.toBe(second?.name);
  });

  it("maxUses를 명시하면 그 값을 따른다", () => {
    const past1 = taggedBooth("past1", "discovery");
    const pick = createLinkPicker([{ booth: past1, kind: "must" }], 0);
    expect(pick(taggedBooth("cand1", "discovery"))).toBeUndefined();
  });
});
