import { describe, expect, it } from "vitest";
import { buildCopresenceLine } from "./copresence";
import { makeT } from "@/lib/i18n/resolve";
import { DICTS } from "@/lib/i18n/dictionaries";
import type { Booth } from "@/lib/types";

const t = makeT(DICTS.ko);

function booth(id: string, valueSlugs: string[], name = `부스-${id}`): Booth {
  return {
    id,
    exhibitionId: "e1",
    hallId: "h1",
    categoryId: "c1",
    name,
    company: "회사",
    description: "",
    longDescription: "",
    images: [],
    tags: valueSlugs,
    x: 0,
    y: 0,
    popularity: 0,
  } as unknown as Booth;
}

describe("buildCopresenceLine — select", () => {
  it("기억(가치 겹침)과 사실(cue)이 둘 다 있으면 결합한다", () => {
    const past = booth("past1", ["discovery"], "지난부스");
    const candidate = booth("cand1", ["discovery"], "이번부스");
    const line = buildCopresenceLine(
      {
        trigger: "select",
        booth: candidate,
        positives: [{ booth: past, kind: "must" }],
        cue: "5시 사인회 있어",
      },
      t,
    );
    expect(line).toContain("지난부스");
    expect(line).toContain("5시 사인회");
  });

  it("기억만 있으면 기억만 말한다", () => {
    const past = booth("past1", ["discovery"], "지난부스");
    const candidate = booth("cand1", ["discovery"], "이번부스");
    const line = buildCopresenceLine(
      { trigger: "select", booth: candidate, positives: [{ booth: past, kind: "must" }] },
      t,
    );
    expect(line).toContain("지난부스");
  });

  it("사실만 있으면 사실만 말한다", () => {
    const candidate = booth("cand1", ["discovery"], "이번부스");
    const line = buildCopresenceLine(
      { trigger: "select", booth: candidate, positives: [], cue: "5시 사인회 있어" },
      t,
    );
    expect(line).toContain("5시 사인회");
  });

  it("겹치는 가치도 cue도 없으면 null — 억지 발화 금지", () => {
    const past = booth("past1", ["discovery"], "지난부스");
    const candidate = booth("cand1", ["social"], "이번부스");
    const line = buildCopresenceLine(
      { trigger: "select", booth: candidate, positives: [{ booth: past, kind: "must" }] },
      t,
    );
    expect(line).toBeNull();
  });

  it("자기 자신은 기억 근거로 안 쓴다", () => {
    const self = booth("self1", ["discovery"], "이번부스");
    const line = buildCopresenceLine(
      { trigger: "select", booth: self, positives: [{ booth: self, kind: "must" }] },
      t,
    );
    expect(line).toBeNull();
  });
});

describe("buildCopresenceLine — unvisitedMust", () => {
  it("부스 이름으로 미방문을 짚는다", () => {
    const line = buildCopresenceLine(
      { trigger: "unvisitedMust", boothName: "꼭갈부스" },
      t,
    );
    expect(line).toContain("꼭갈부스");
  });
});

describe("buildCopresenceLine — searchHit", () => {
  it("겹치는 가치가 있으면 카테고리 라벨로 제안한다", () => {
    const past = booth("past1", ["discovery"], "지난부스");
    const hit = booth("hit1", ["discovery"], "검색결과");
    const line = buildCopresenceLine(
      {
        trigger: "searchHit",
        booth: hit,
        positives: [{ booth: past, kind: "must" }],
        categoryLabel: "독립출판",
      },
      t,
    );
    expect(line).toContain("검색결과");
    expect(line).toContain("독립출판");
  });

  it("겹치는 가치가 없으면 null", () => {
    const past = booth("past1", ["discovery"], "지난부스");
    const hit = booth("hit1", ["social"], "검색결과");
    const line = buildCopresenceLine(
      { trigger: "searchHit", booth: hit, positives: [{ booth: past, kind: "must" }] },
      t,
    );
    expect(line).toBeNull();
  });
});
