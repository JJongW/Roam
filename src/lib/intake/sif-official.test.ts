import { describe, expect, it } from "vitest";
import {
  buildSifBrandsFile,
  parseCompare,
  parseParticipants,
  parseProfileCheck,
  pinFromNameMatches,
  v21MergedCodes,
  type SifV21Link,
} from "./sif-official";

const PARTICIPANTS = ["type\tname", "국내 작가\t115룸", "국내 작가\t결", "국내 작가\t결", "국내 작가\t양면테이프", "국내 기업\t새회사", "국내 작가\t모이또이", "국내 작가\t링크없음"].join("\n");
const COMPARE = [
  "V22분류\tV22이름\t대조\tV21부스\tV21이름\tV21분류",
  "국내 작가\t115룸\t같은 이름\tD35\t115 룸\t국내 작가",
  "국내 작가\t결\t같은 이름(짧아서 확인 필요)\tM26\t결\t국내 작가",
  "국내 작가\t결\t같은 이름(짧아서 확인 필요)\tM26\t결\t국내 작가",
  "국내 작가\t양면테이프\t비슷한 이름(확인 필요)\tG19\t양면테이프(박주현)\t국내 작가",
  "국내 기업\t새회사\t새 참가\t\t\t",
  "국내 작가\t모이또이\t같은 이름\tA02\t모이또이\t국내 작가",
  "국내 작가\t링크없음\t같은 이름\tZ01\t링크없음\t국내 작가",
].join("\n");
const LINKS: Record<string, SifV21Link> = {
  D35: { instagram: "https://www.instagram.com/115room", website: "https://115room.kr", intro: "우리가 좋아하는 공간, 115room" },
  M26: { instagram: "https://www.instagram.com/gyeol" },
  G19: { instagram: "https://www.instagram.com/both_tape", intro: "양면을 그려요" },
  // 링크 모음 서비스: 계정이 달라도 identity.ts가 같은 키(link.inpock.co.kr)로 본다.
  A01: { instagram: "https://www.instagram.com/lovememore", website: "https://link.inpock.co.kr/lovememore" },
  A02: { instagram: "https://www.instagram.com/moii_ttoi", website: "https://link.inpock.co.kr/moii_ttoi" },
};
const base = {
  participants: parseParticipants(PARTICIPANTS),
  compare: parseCompare(COMPARE),
  v21Links: LINKS,
  exhibitionSlug: "sif-2026-winter",
  sourceUrl: "https://www.ocreo.kr/fair/sif22",
  collectedAt: "2026-11-20",
  v21IntroSource: "V.21 프로필",
};

describe("SIF 명단 → brands.v1", () => {
  it("같은 이름은 V.21 링크와 소개 원문을 잇고, 확인 필요한 곳은 판정 전까지 빼고, 명단 중복 줄은 하나만", () => {
    const r = buildSifBrandsFile(base);
    expect(r.file.brands.map((b) => b.name)).toEqual(["115룸", "새회사", "링크없음"]);
    expect(r.file.brands[0]).toEqual({
      key: "sif22-115룸",
      name: "115룸",
      category: "국내 작가",
      participationType: "국내 작가",
      instagramUrl: "https://www.instagram.com/115room",
      websiteUrl: "https://115room.kr/",
      aliases: ["115 룸"],
      intro: { text: "우리가 좋아하는 공간, 115room", status: "collected", source: "V.21 프로필#D35" },
    });
    expect(r.file.brands[1]).toEqual({ key: "sif22-새회사", name: "새회사", category: "국내 기업", participationType: "국내 기업" });
    expect(r.held.map((h) => [h.name, h.reason])).toEqual([
      ["결", "프로필 대조 결과가 아직 없어요"],
      ["양면테이프", "프로필 대조 결과가 아직 없어요"],
      ["모이또이", "V.21 링크가 링크 모음 서비스 주소라 다른 작가와 한 브랜드로 묶였을 수 있어요"],
    ]);
    expect(r.duplicateRows).toEqual([{ type: "국내 작가", name: "결" }]);
    expect(r.carried.map((c) => [c.name, c.withLinks])).toEqual([
      ["115룸", true],
      ["링크없음", false],
    ]);
  });

  it("프로필 대조: 같은 작가는 잇고, 다른 작가는 지난 회차 정보 없이 새로, 모름은 계속 뺀다", () => {
    const check = parseProfileCheck(["V22이름\t판정", "결\t다른 작가", "양면테이프\t같은 작가"].join("\n"));
    const r = buildSifBrandsFile({ ...base, profileCheck: check });
    const byName = new Map(r.file.brands.map((b) => [b.name, b]));
    expect(byName.get("결")).toEqual({ key: "sif22-결", name: "결", category: "국내 작가", participationType: "국내 작가" });
    expect(byName.get("양면테이프")).toMatchObject({ instagramUrl: "https://www.instagram.com/both_tape", aliases: ["양면테이프(박주현)"] });
    expect(r.held.map((h) => h.name)).toEqual(["모이또이"]);
    expect(parseProfileCheck(["V22이름\t판정", "결\t같은 작가", "결\t다른 작가"].join("\n")).get("결")).toBe("모름");
  });

  it("링크 모음 주소로 뭉치는 V.21 부스만 고른다(같은 인스타와 사이트를 쓰는 한 브랜드는 아님)", () => {
    expect([...v21MergedCodes(LINKS)].sort()).toEqual(["A01", "A02"]);
    expect(
      v21MergedCodes({
        X1: { instagram: "https://instagram.com/same", website: "https://same.kr" },
        X2: { instagram: "https://www.instagram.com/same/", website: "https://same.kr/" },
      }).size,
    ).toBe(0);
  });

  it("미리보기 이름 일치는 지난 회차와 같다고 본 곳에, 기존 브랜드가 하나일 때만 적는다", () => {
    const r = buildSifBrandsFile(base);
    const pin = pinFromNameMatches(r.file, r.carried, [
      { key: "sif22-링크없음", name: "링크없음", existing: [{ id: "ex1", name: "링크없음" }] },
      { key: "sif22-새회사", name: "새회사", existing: [{ id: "ex2", name: "새회사" }] },
    ]);
    expect(pin.pinned).toEqual([{ key: "sif22-링크없음", id: "ex1", name: "링크없음" }]);
    expect(pin.file.brands.find((b) => b.name === "링크없음")?.exhibitorId).toBe("ex1");
    expect(pin.file.brands.find((b) => b.name === "새회사")?.exhibitorId).toBeUndefined();
    const two = pinFromNameMatches(r.file, r.carried, [
      { key: "sif22-링크없음", name: "링크없음", existing: [{ id: "a", name: "링크없음" }, { id: "b", name: "링크없음" }] },
    ]);
    expect(two.pinned).toEqual([]);
    expect(two.ambiguous).toHaveLength(1);
  });

  it("모르는 대조 값이나 대조 파일에 없는 이름이면 멈춘다", () => {
    expect(() => parseCompare("V22분류\tV22이름\t대조\nx\ty\t아마도")).toThrow();
    expect(() => buildSifBrandsFile({ ...base, participants: [{ type: "국내 작가", name: "없는이름" }] })).toThrow();
  });
});
