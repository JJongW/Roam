import { describe, expect, it } from "vitest";
import { deriveValueTags } from "./derive";
import { VALUE_SLUGS } from "./index";

describe("deriveValueTags", () => {
  it("수동 valueTags가 있으면 그걸 정규화해 우선", () => {
    const out = deriveValueTags({
      manual: [{ slug: "goods", strength: 0.9 }],
      categorySlugs: ["lit"],
    });
    expect(out).toEqual([{ slug: "goods", strength: 0.9 }]);
  });

  it("분야 → 기본 가치 (art→오감)", () => {
    const out = deriveValueTags({ categorySlugs: ["art"] });
    expect(out.map((t) => t.slug)).toContain("sensory");
  });

  it("굿즈 키워드 → goods", () => {
    const out = deriveValueTags({ categorySlugs: ["lit"], goodsKeywords: ["에코백", "키링"] });
    expect(out.map((t) => t.slug)).toContain("goods");
  });

  it("tips 체험 키워드 → experience", () => {
    const out = deriveValueTags({ categorySlugs: ["lit"], tips: "직접 만들어보는 워크숍 진행" });
    expect(out.map((t) => t.slug)).toContain("experience");
  });

  it("빈 입력 → discovery 폴백", () => {
    const out = deriveValueTags({});
    expect(out).toEqual([{ slug: "discovery", strength: 0.3 }]);
  });

  it("강도 내림차순 + 상위 4개 컷 + 유효 slug", () => {
    const out = deriveValueTags({
      categorySlugs: ["lit", "art", "science"],
      goodsKeywords: ["굿즈"],
      tips: "독립출판 신간 체험 조용한 공간",
    });
    expect(out.length).toBeLessThanOrEqual(4);
    for (let i = 1; i < out.length; i++) {
      expect(out[i - 1].strength).toBeGreaterThanOrEqual(out[i].strength);
    }
    for (const t of out) {
      expect(VALUE_SLUGS).toContain(t.slug);
      expect(t.strength).toBeGreaterThan(0);
      expect(t.strength).toBeLessThanOrEqual(1);
    }
  });
});
