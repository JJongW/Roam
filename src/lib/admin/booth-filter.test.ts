import { describe, expect, it } from "vitest";
import {
  compareBoothsByCode,
  matchesBoothQuery,
  splitLines,
} from "./booth-filter";
import type { Booth } from "@/lib/types";

function makeBooth(overrides: Partial<Booth>): Booth {
  return {
    id: overrides.id ?? "b1",
    exhibitionId: "e1",
    hallId: "h1",
    categoryId: "c1",
    name: "부스",
    company: "회사",
    description: "",
    longDescription: "",
    images: [],
    tags: [],
    x: 0,
    y: 0,
    ...overrides,
  } as Booth;
}

describe("compareBoothsByCode", () => {
  it("코드를 자연 정렬한다 — C2가 C10보다 앞", () => {
    const c2 = makeBooth({ id: "a", code: "C2" });
    const c10 = makeBooth({ id: "b", code: "C10" });
    expect(compareBoothsByCode(c2, c10)).toBeLessThan(0);
    expect(compareBoothsByCode(c10, c2)).toBeGreaterThan(0);
  });

  it("코드 있는 부스가 코드 없는 부스보다 항상 앞선다", () => {
    const withCode = makeBooth({ id: "a", code: "A01" });
    const noCode = makeBooth({ id: "b", code: undefined, name: "가나다" });
    expect(compareBoothsByCode(withCode, noCode)).toBeLessThan(0);
    expect(compareBoothsByCode(noCode, withCode)).toBeGreaterThan(0);
  });

  it("둘 다 코드 없으면 이름순으로 폴백한다", () => {
    const a = makeBooth({ id: "a", code: undefined, name: "가나" });
    const b = makeBooth({ id: "b", code: undefined, name: "다라" });
    expect(compareBoothsByCode(a, b)).toBeLessThan(0);
  });
});

describe("matchesBoothQuery", () => {
  const booth = makeBooth({
    id: "x",
    name: "고스트북스",
    company: "출판사",
    code: "A101",
  });

  it("이름·회사·코드 중 하나라도 포함하면 매칭한다(대소문자 무시)", () => {
    expect(matchesBoothQuery(booth, "고스트")).toBe(true);
    expect(matchesBoothQuery(booth, "출판")).toBe(true);
    expect(matchesBoothQuery(booth, "a101")).toBe(true);
  });

  it("빈 검색어는 전부 매칭한다", () => {
    expect(matchesBoothQuery(booth, "")).toBe(true);
    expect(matchesBoothQuery(booth, "   ")).toBe(true);
  });

  it("아무 데도 없으면 매칭 안 한다", () => {
    expect(matchesBoothQuery(booth, "없는말")).toBe(false);
  });

  it("코드가 없는 부스에서도 에러 없이 동작한다", () => {
    const noCode = makeBooth({ id: "y", code: undefined });
    expect(matchesBoothQuery(noCode, "아무거나")).toBe(false);
  });
});

describe("splitLines", () => {
  it("줄바꿈으로 나누고 각 줄을 trim한다", () => {
    expect(splitLines("신간 훑기\n  제작 과정 물어보기  \n")).toEqual([
      "신간 훑기",
      "제작 과정 물어보기",
    ]);
  });

  it("빈 줄은 뺀다", () => {
    expect(splitLines("한 줄\n\n\n다른 줄")).toEqual(["한 줄", "다른 줄"]);
  });

  it("빈 문자열은 빈 배열", () => {
    expect(splitLines("")).toEqual([]);
    expect(splitLines("   \n  ")).toEqual([]);
  });
});
