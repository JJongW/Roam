import { describe, expect, it } from "vitest";
import { boothAbout } from "./about";
import type { Booth } from "@/lib/types";

function booth(over: Partial<Booth> = {}): Booth {
  return {
    id: "b",
    exhibitionId: "e",
    hallId: "h",
    categoryId: "c",
    kind: "exhibitor",
    name: "테스트 부스",
    company: "",
    description: "",
    longDescription: "원문 소개입니다.",
    images: [],
    tags: [],
    valueTags: [],
    x: 0,
    y: 0,
    popularity: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}

const enrich = (over: Record<string, unknown> = {}) => ({
  goodsKeywords: [] as string[],
  themeTags: [] as string[],
  ...over,
});

describe("boothAbout — 로미 발화", () => {
  it("테마 대분류만 있으면 그것만 말한다", () => {
    const a = boothAbout(booth({ tags: ["kr-artist", "animal"] }));
    expect(a.romi).toBe("동물 쪽 부스야.");
  });

  it("소분류가 있으면 더 구체적으로 말한다", () => {
    const a = boothAbout(
      booth({
        tags: ["kr-artist", "animal"],
        enrichment: enrich({ themeTags: ["고양이", "반려동물"] }) as never,
      }),
    );
    expect(a.romi).toContain("고양이·반려동물");
  });

  it("굿즈 개수에 따라 표현이 달라진다", () => {
    const many = boothAbout(
      booth({
        tags: ["kr-artist", "animal"],
        enrichment: enrich({ goodsKeywords: Array(12).fill("x") }) as never,
      }),
    );
    const few = boothAbout(
      booth({
        tags: ["kr-artist", "animal"],
        enrichment: enrich({ goodsKeywords: ["a"] }) as never,
      }),
    );
    expect(many.romi).toContain("12가지");
    expect(few.romi).toContain("조금");
    expect(many.romi).not.toBe(few.romi);
  });

  // 지어내지 않는다 — 재료가 없으면 로미는 말하지 않는다.
  it("테마도 굿즈도 없으면 로미 발화가 없다", () => {
    expect(boothAbout(booth()).romi).toBeUndefined();
  });
});

describe("boothAbout — 작가 인용", () => {
  it("내용이 있는 소개는 원문 그대로 인용한다(존댓말도 고치지 않는다)", () => {
    const a = boothAbout(
      booth({ enrichment: enrich({ summary: "흔한 일상을 그리는 사람입니다" }) as never }),
    );
    expect(a.quote).toBe("흔한 일상을 그리는 사람입니다");
  });

  // 상당수 소개가 부스코드·페어 일정뿐이라, 그대로 인용하면 정보가 아닌 걸
  // 작가의 말인 양 보여주게 된다.
  it("페어 일정·부스코드뿐인 소개는 인용하지 않는다", () => {
    for (const noise of [
      "서일페 C01. 7/30-8/2",
      "7월 서일페 / 10월 부일페 / 12월서일페.",
      "SIF V.21 2026.07.30-08.02 P40",
    ]) {
      expect(boothAbout(booth({ enrichment: enrich({ summary: noise }) as never })).quote)
        .toBeUndefined();
    }
  });

  it("소개가 없으면 인용하지 않는다", () => {
    expect(boothAbout(booth()).quote).toBeUndefined();
  });
});

describe("boothAbout — 폴백", () => {
  it("로미 발화도 인용도 못 만들 때만 원문을 쓴다", () => {
    expect(boothAbout(booth()).fallback).toBe("원문 소개입니다.");
  });

  it("로미 발화가 있으면 원문 템플릿을 쓰지 않는다", () => {
    const a = boothAbout(booth({ tags: ["kr-artist", "animal"] }));
    expect(a.fallback).toBeUndefined();
  });

  it("인용만 있어도 원문 템플릿을 쓰지 않는다", () => {
    const a = boothAbout(
      booth({ enrichment: enrich({ summary: "고양이를 그리는 작가입니다" }) as never }),
    );
    expect(a.fallback).toBeUndefined();
  });
});
