import { describe, expect, it } from "vitest";
import {
  buildSifBrandsFile,
  parseCompare,
  parseParticipants,
  parseProfileCheck,
  pastFairMention,
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
    const check = parseProfileCheck(["V22이름\t판정\t근거", "결\t다른 작가\t", "양면테이프\t같은 작가\t"].join("\n"));
    // 명단에 결이 두 번인데 대조 줄은 하나 → 하나만 넣고, 판정은 그 줄을 따른다.
    const r = buildSifBrandsFile({ ...base, profileCheck: check });
    const byName = new Map(r.file.brands.map((b) => [b.name, b]));
    expect(byName.get("결")).toEqual({ key: "sif22-결", name: "결", category: "국내 작가", participationType: "국내 작가" });
    expect(byName.get("양면테이프")).toMatchObject({ instagramUrl: "https://www.instagram.com/both_tape", aliases: ["양면테이프(박주현)"] });
    expect(r.held.map((h) => h.name)).toEqual(["모이또이"]);
    expect(r.duplicateRows).toEqual([{ type: "국내 작가", name: "결" }]);
  });

  it("같은 이름 카드가 둘이고 대조 줄도 둘이면 프로필 주소로 키를 갈라 두 브랜드로 넣는다", () => {
    const check = parseProfileCheck(
      [
        "V22이름\t판정\t근거\t오크레오 프로필 주소",
        "결\t같은 작가\tV.21 M26\thttps://www.ocreo.kr/profile/aaaaaaaaaaaaaaaaaaaaaaaa",
        "결\t다른 작가\tV.21 없음\thttps://www.ocreo.kr/profile/bbbbbbbbbbbbbbbbbbbbbbbb",
      ].join("\n"),
    );
    const r = buildSifBrandsFile({ ...base, profileCheck: check });
    const gyeol = r.file.brands.filter((b) => b.name === "결");
    expect(gyeol.map((b) => b.key)).toEqual(["sif22-결-aaaaaaaaaaaaaaaaaaaaaaaa", "sif22-결-bbbbbbbbbbbbbbbbbbbbbbbb"]);
    expect(gyeol[0].instagramUrl).toBe("https://www.instagram.com/gyeol");
    expect(gyeol[1].instagramUrl).toBeUndefined();
    expect(r.duplicateRows).toEqual([]);
  });

  it("같은 작가인데 V.22 프로필 인스타가 다르면 V.22 쪽을 적고 확인 대상으로 낸다", () => {
    const check = parseProfileCheck(
      ["V22이름\t판정\t근거", "양면테이프\t같은 작가\t이력에 V.21 G19. 다만 프로필 인스타는 @tape_new로 V.21과 다름"].join("\n"),
    );
    const r = buildSifBrandsFile({ ...base, profileCheck: check });
    expect(r.file.brands.find((b) => b.name === "양면테이프")?.instagramUrl).toBe("https://www.instagram.com/tape_new");
    expect(r.instagramFromV22).toEqual([
      { key: "sif22-양면테이프", name: "양면테이프", v21: "https://www.instagram.com/both_tape", v22: "https://www.instagram.com/tape_new" },
    ]);
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

  it("지난 회차 부스 번호, 날짜, 회차 표기가 있는 V.21 소개는 옮기지 않는다(원문은 고치지 않고 통째로 뺀다)", () => {
    for (const t of [
      "도깨비 화방 | 서일페 D40. 무루와 고양이들이 담긴 골목 풍경 일러스트 작가.",
      "몽진아트 | 서일페 L-18, 맛있는 음식+즐거운 일상",
      "사리사 / *서코섬머 양일 CJ_75",
      "김구구_Illustrator. 서울일러스트레이션페어21 7.31~8.2 코엑스",
      "끼니들이 살아가는 귀여운 일상 7/30(목) - 8/2(일)",
      "7월 서일페 / 10월 대전 페퍼클",
      "2026.07.30 ~ 08.02 서일페",
      "202607 서울일러스트레이션페어",
      "Artist, SEOUL ILLUSTRATION FAIR V.21",
      "서일페v21참가",
      "21회 참가",
      "여름 서일페에서 만나요",
      "7月 서일페",
    ])
      expect(pastFairMention(t), t).not.toBeNull();
    for (const t of [
      "우리가 좋아하는 공간, 115room",
      "What ever you do, wherever you go. 365 days of christmas!",
      "담장아래 | Illustrator. ⓒ2018 DAMJANG ALAE.",
      "덩이나라 DUNG2NARA. 고양이 캐릭터 스티커/문구 브랜드.",
      "매월 1일 '드로잉데이 배경화면' 배포.",
      "11년 경력 애니메이션/게임 컨셉아티스트",
      "Art, 2015 다음웹툰 감염 연재, 2016~2020 버프툰 좀비신드롬 연재",
      "3D ARTWORK. 서일페 인기템 카드지갑 출시",
      "A4 노트와 B612 엽서",
      "서울 마포구 망원로 4길 3, 2층 쇼룸",
      "먼슬리•위클리 스티커",
    ])
      expect(pastFairMention(t), t).toBeNull();

    const r = buildSifBrandsFile({ ...base, v21Links: { ...LINKS, D35: { ...LINKS.D35, intro: "115룸 | 서일페 D35, 공간을 그려요" } } });
    expect(r.file.brands.find((b) => b.name === "115룸")?.intro).toBeUndefined();
    expect(r.introDropped).toEqual([{ key: "sif22-115룸", name: "115룸", v21Code: "D35", hit: "D35", text: "115룸 | 서일페 D35, 공간을 그려요" }]);
  });
});
