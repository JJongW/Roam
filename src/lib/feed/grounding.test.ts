import { describe, expect, it } from "vitest";
import { buildGrounding } from "@/lib/feed/grounding";
import type { Booth } from "@/lib/types";

function booth(enrichment?: Booth["enrichment"], company = "예시출판"): Booth {
  return {
    id: "b1",
    exhibitionId: "e1",
    code: "A-12",
    name: "예시 부스",
    company,
    kind: "exhibitor",
    categoryId: "c1",
    tags: [],
    // seed.ts가 enrichment.valueTags를 부스 top-level로 복사하는 동작을 모사.
    valueTags: enrichment?.valueTags,
    x: 0,
    y: 0,
    width: 1,
    height: 1,
    enrichment,
  } as unknown as Booth;
}

describe("buildGrounding", () => {
  it("가치별 저작 근거는 2절로 붙는다 — 1절(사실)을 밀어내지 않는다", () => {
    const b = booth({
      goodsKeywords: [],
      themeTags: [],
      summary: "독립 에세이 출판사",
      valueTags: [
        { slug: "discovery", strength: 0.9 },
        { slug: "social", strength: 0.6 },
      ],
      recommendationReasons: {
        discovery: "제작자 취향이 강한 책을 찾기 좋아.",
        social: "운영자가 제작 과정을 직접 설명해줘.",
      },
      thingsToDo: ["신간 훑기", "제작 과정 물어보기"],
    });
    const g = buildGrounding(b, ["discovery"]);
    // 1절(사실)과 2절(근거)이 둘 다 살아 있어야 한다. 예전엔 둘이 같은 자리에서
    // 경쟁해 recommendationReasons가 한 번도 안 나왔다(감사 발견 1).
    expect(g.why).toContain("독립 에세이 출판사"); // 1절
    expect(g.why).toContain("제작자 취향"); // 2절
    expect(g.why).not.toContain("운영자가 제작 과정"); // 관심 없는 가치 근거는 안 붙임
    expect(g.why).not.toContain("social");
    expect(g.todo).toEqual(["신간 훑기", "제작 과정 물어보기"]);
    expect(g.confidence).toBe("high"); // 해석+가치+행동 저작
    expect(g.what).toBe("독립 에세이 출판사");
  });

  it("가치 이름은 발화에 넣지 않는다 — 부스 사실만 말한다", () => {
    const b = booth({
      goodsKeywords: ["엽서", "에코백"],
      themeTags: [],
      summary: "그림책 부스",
      valueTags: [{ slug: "goods", strength: 0.8 }],
      tips: "오후 혼잡",
    });
    const g = buildGrounding(b, ["goods"]);
    // "굿즈 쪽이랑 겹쳐" 같은 분류 되읽기는 현장에서 아무 정보가 아니다.
    expect(g.why).toBe("그림책 부스");
    expect(g.evidence).toContain("엽서");
    expect(g.todo).toEqual([]);
  });

  it("근거는 내가 실제로 누른 부스로 말한다", () => {
    const b = booth({
      goodsKeywords: [],
      themeTags: [],
      roamInterpretation: "손으로 엮은 책만 만드는 곳이야.",
    });
    const g = buildGrounding(b, ["goods"], "ko", {
      name: "비온뒤",
      kind: "curious",
    });
    expect(g.why).toContain("손으로 엮은 책");
    expect(g.why).toContain("비온뒤");
  });

  it("저작·공식 정보가 전혀 없어도 부스 이름으로 최소한을 말한다 — 침묵 카드를 만들지 않는다", () => {
    const b = booth(undefined, "총류 외 3"); // 실제 시드 데이터의 company 필드 모양(카테고리 요약) — 이름이 아니다
    const g = buildGrounding(b, ["learning"]);
    expect(g.confidence).toBe("low");
    expect(g.why).toContain("예시 부스"); // booth()의 기본 name — company가 아니라 name으로 말해야 한다
  });

  // 감사 결과 발견 2 — docs/qa/2026-08-15_grounding-audit.md
  it("부스가 직접 쓴 존댓말 소개는 로미 말로 쓰지 않고 인용으로 내린다", () => {
    const b = booth({
      goodsKeywords: [],
      themeTags: [],
      summary: "안녕하세요! 순간을 기록하는 423희희입니다",
    });
    const g = buildGrounding(b, ["discovery"]);
    // 로미의 사실 절에 남의 존댓말이 섞이면 화자가 뒤집힌다.
    expect(g.why).not.toContain("안녕하세요");
    expect(g.why).not.toContain("입니다");
    // 정보를 버리지는 않는다 — 출처를 밝혀 인용한다.
    expect(g.quote).toBe("안녕하세요! 순간을 기록하는 423희희입니다");
  });

  it("판매 홍보가 섞인 소개도 인용으로 내린다", () => {
    const b = booth({
      goodsKeywords: [],
      themeTags: [],
      summary: "일러스트북 <갈라테이아> 교보문고 판매중",
    });
    const g = buildGrounding(b, ["goods"]);
    expect(g.why).not.toContain("교보문고");
    expect(g.quote).toContain("교보문고");
  });

  it("운영자가 쓴 공식 소개는 그대로 로미의 사실 절이 된다 (인용 아님)", () => {
    const b = booth({
      goodsKeywords: [],
      themeTags: [],
      summary: "손으로 엮은 책만 만드는 작은 출판사",
    });
    const g = buildGrounding(b, ["discovery"]);
    expect(g.why).toContain("손으로 엮은 책");
    expect(g.quote).toBeNull();
  });
  it("내가 누른 부스가 있으면 그게 2절을 차지한다 — 가치 근거보다 행동이 우선", () => {
    const b = booth({
      goodsKeywords: [],
      themeTags: [],
      roamInterpretation: "손으로 엮은 책만 만드는 곳이야.",
      valueTags: [{ slug: "discovery", strength: 0.9 }],
      recommendationReasons: { discovery: "제작자 취향이 강한 책을 찾기 좋아." },
    });
    const g = buildGrounding(b, ["discovery"], "ko", {
      name: "비온뒤",
      kind: "curious",
    });
    expect(g.why).toContain("손으로 엮은 책"); // 1절
    expect(g.why).toContain("비온뒤"); // 2절 = 내 행동
    expect(g.why).not.toContain("제작자 취향"); // 두 근거를 겹쳐 쓰지 않는다
  });

  it("겹치는 가치가 없으면 2절을 붙이지 않는다 — 없는 근거를 지어내지 않는다", () => {
    const b = booth({
      goodsKeywords: [],
      themeTags: [],
      roamInterpretation: "손으로 엮은 책만 만드는 곳이야.",
      valueTags: [{ slug: "discovery", strength: 0.9 }],
      recommendationReasons: { discovery: "제작자 취향이 강한 책을 찾기 좋아." },
    });
    const g = buildGrounding(b, ["goods"]); // 관심 가치가 안 겹침
    expect(g.why).toBe("손으로 엮은 책만 만드는 곳이야.");
  });

  it("가장 강하게 겹치는 가치의 근거 하나만 쓴다 — 한 호흡", () => {
    const b = booth({
      goodsKeywords: [],
      themeTags: [],
      roamInterpretation: "장르문학 팬심이 모이는 부스야.",
      valueTags: [
        { slug: "goods", strength: 0.9 },
        { slug: "discovery", strength: 0.7 },
      ],
      recommendationReasons: {
        goods: "소장각 굿즈가 많아.",
        discovery: "팬덤 두꺼운 장르문학을 한자리에서 파볼 수 있어.",
      },
    });
    const g = buildGrounding(b, ["discovery", "goods"]);
    expect(g.why).toContain("소장각 굿즈"); // valueTags 강도 1위(goods)
    expect(g.why).not.toContain("팬덤 두꺼운"); // 2순위는 안 붙는다
  });
  it("신뢰도는 사용자가 읽는 문장이 어디서 왔는지로 정해진다", () => {
    // 저작 해석 + 저작 부가재료 → 충분
    const authored = booth({
      goodsKeywords: [],
      themeTags: [],
      roamInterpretation: "손으로 엮은 책만 만드는 곳이야.",
      thingsToDo: ["제작 과정 물어보기"],
    });
    expect(buildGrounding(authored, []).confidence).toBe("high");

    // 저작 해석만 (하우스 아카이브 99곳이 이 상태) → 보통. 과장하지 않는다.
    const onlyInterpretation = booth({
      goodsKeywords: [],
      themeTags: [],
      summary: "1874년 설립된 조명 브랜드입니다.",
      roamInterpretation: "1874년부터 이어온 덴마크 조명 브랜드야.",
    });
    expect(buildGrounding(onlyInterpretation, []).confidence).toBe("medium");

    // 요약이 인용으로 밀려나 로미가 부스명만 말하는 경우 → 낮음.
    // 예전 공식은 이때도 요약을 점수에 세서 "보통"으로 과장했다.
    const demoted = booth({
      goodsKeywords: ["엽서"],
      themeTags: [],
      summary: "안녕하세요! 그림 그리는 사람입니다",
    });
    const g = buildGrounding(demoted, []);
    expect(g.quote).toContain("안녕하세요");
    expect(g.confidence).toBe("low");
  });

  it("저작 해석이 있으면 요약을 인용으로 중복 노출하지 않는다", () => {
    // 하우스 아카이브: 요약은 주최 측이 쓴 존댓말이지만 1절은 저작 해석이 가져간다.
    // 밀려난 게 아니므로 "부스가 직접 쓴 소개"로 붙이면 출처를 잘못 말하는 것이다.
    const b = booth({
      goodsKeywords: [],
      themeTags: [],
      summary: "덴마크 디자인 전통을 계승한 조명 제품을 선보입니다.",
      roamInterpretation: "1874년부터 이어온 덴마크 조명 브랜드야.",
    });
    const g = buildGrounding(b, []);
    expect(g.why).toBe("1874년부터 이어온 덴마크 조명 브랜드야.");
    expect(g.quote).toBeNull();
  });
});
