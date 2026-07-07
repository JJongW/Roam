import { describe, expect, it } from "vitest";
import { boothValueSlugs } from "./index";

describe("boothValueSlugs", () => {
  it("valueTags 있으면 가치 slug 반환", () => {
    expect(
      boothValueSlugs({
        tags: ["lit"],
        valueTags: [
          { slug: "goods", strength: 0.6 },
          { slug: "discovery", strength: 0.4 },
        ],
      }),
    ).toEqual(["goods", "discovery"]);
  });

  it("valueTags 없으면 분야 tags 폴백", () => {
    expect(boothValueSlugs({ tags: ["lit", "art"] })).toEqual(["lit", "art"]);
  });

  it("valueTags 빈 배열도 폴백", () => {
    expect(boothValueSlugs({ tags: ["lit"], valueTags: [] })).toEqual(["lit"]);
  });
});
