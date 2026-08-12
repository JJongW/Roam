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
  it("저작 추천 근거를 사용자 관심 가치에 맞춰 최우선 채택", () => {
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
    expect(g.why).toContain("제작자 취향");
    expect(g.why).not.toContain("social"); // 관심 없는 가치 근거는 안 붙임
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

  it("저작·공식 정보가 전혀 없어도 회사명으로 최소한을 말한다 — 침묵 카드를 만들지 않는다", () => {
    const b = booth(undefined, "무명출판");
    const g = buildGrounding(b, ["learning"]);
    expect(g.confidence).toBe("low");
    expect(g.what).toBe("무명출판");
    expect(g.why).toContain("무명출판");
  });
});
