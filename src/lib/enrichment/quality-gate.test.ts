import { describe, expect, it } from "vitest";
import { gradeCandidate } from "./quality-gate";
import type { GradeInput } from "./quality-gate";

const booth = { name: "루이스폴센" };
const sources = [{ uri: "https://example.com/a" }];

function good(over: Partial<GradeInput["payload"]> = {}): GradeInput {
  return {
    booth,
    sources,
    payload: {
      summary: "1874년 설립된 덴마크 조명 브랜드입니다.",
      roamInterpretation: "약통을 재사용한 드롭 램프가 시그니처야.",
      valueTags: [{ slug: "goods", strength: 0.8 }],
      recommendationReasons: { goods: "PH 시리즈 실물을 볼 수 있어." },
      thingsToDo: ["조명 아래 앉아보기"],
      ...over,
    },
  };
}

describe("gradeCandidate — 통과", () => {
  it("근거 있고 규약 지킨 초안은 높은 신뢰도", () => {
    const r = gradeCandidate(good());
    expect(r.issues).toEqual([]);
    expect(r.confidence).toBe(1);
  });
});

describe("gradeCandidate — CLAUDE.md 규약의 기계적 표현", () => {
  it("분류를 되읽어주면 감점한다", () => {
    for (const line of [
      "발견 쪽 부스야.",
      "네 관심 가치랑 겹쳐.",
      "이 부스의 가치는 굿즈야.",
      "goods 성향이 강한 곳이야.",
    ]) {
      const r = gradeCandidate(good({ roamInterpretation: line }));
      expect(r.issues.map((i) => i.code), line).toContain("value_word_in_voice");
    }
  });

  it("가치 라벨이 일상어로 쓰인 건 잡지 않는다", () => {
    // SIF 50건에서 8건이 이걸로 오탐이었다 — "굿즈"는 그냥 물건을 가리키는 말이지
    // 분류가 아니다. 그대로 뒀으면 47건 중 8건이 불필요하게 재조사로 갔다.
    for (const line of [
      "감자숭이 캐릭터 굿즈를 만날 수 있는 부스야.",
      "고양이 핸드메이드 굿즈를 만날 수 있어.",
      "직접 만져보는 체험을 할 수 있어.",
      "작가한테 제작 과정을 학습할 수 있어.",
    ]) {
      const r = gradeCandidate(good({ roamInterpretation: line }));
      expect(r.issues.map((i) => i.code), line).not.toContain(
        "value_word_in_voice",
      );
    }
  });

  it("부스명만 되풀이하면 감점한다", () => {
    const r = gradeCandidate(good({ roamInterpretation: "루이스폴센 부스야" }));
    expect(r.issues.map((i) => i.code)).toContain("name_only");
  });

  it("존댓말이면 로미의 말이 아니다 — voice.ts 판정을 빌려 쓴다", () => {
    const r = gradeCandidate(
      good({ roamInterpretation: "안녕하세요, 조명을 만드는 브랜드입니다." }),
    );
    expect(r.issues.map((i) => i.code)).toContain("not_roam_voice");
  });

  it("로미 한 줄이 없으면 감점한다", () => {
    const r = gradeCandidate(good({ roamInterpretation: "" }));
    expect(r.issues.map((i) => i.code)).toContain("no_interpretation");
  });
});

describe("gradeCandidate — 스키마·정합성", () => {
  it("캐논에 없는 가치 slug을 잡는다", () => {
    const r = gradeCandidate(
      good({ valueTags: [{ slug: "shopping", strength: 0.5 }] }),
    );
    expect(r.issues.map((i) => i.code)).toContain("unknown_value_slug");
  });

  it("태그 없는 가치의 근거만 있으면 잡는다", () => {
    const r = gradeCandidate(
      good({ recommendationReasons: { rest: "앉을 데가 있어." } }),
    );
    expect(r.issues.map((i) => i.code)).toContain("reason_without_tag");
  });

  it("가치를 다 붙이면 아무것도 안 고른 것과 같다", () => {
    const r = gradeCandidate(
      good({
        valueTags: [
          { slug: "goods", strength: 0.8 },
          { slug: "rest", strength: 0.8 },
          { slug: "trend", strength: 0.8 },
          { slug: "social", strength: 0.8 },
          { slug: "learning", strength: 0.8 },
        ],
      }),
    );
    expect(r.issues.map((i) => i.code)).toContain("too_many_value_tags");
  });
});

describe("gradeCandidate — 요청한 필드만 심사한다", () => {
  it("이미 사람이 채운 필드를 안 썼다고 깎지 않는다", () => {
    // 파일럿에서 9/9가 이걸로 깎였다 — 하우스 아카이브는 로미 한 줄이 이미
    // 100%라 초안기가 안 쓴 게 맞는 동작인데 게이트가 "없다"고 봤다.
    const r = gradeCandidate({
      ...good({ roamInterpretation: "" }),
      requested: ["thingsToDo"],
    });
    expect(r.issues.map((i) => i.code)).not.toContain("no_interpretation");
  });

  it("재료가 있었으면 출처 없음의 무게가 작다", () => {
    const withMaterial = gradeCandidate({ ...good(), sources: [], hadMaterial: true });
    const without = gradeCandidate({ ...good(), sources: [], hadMaterial: false });
    expect(withMaterial.confidence).toBeGreaterThan(without.confidence);
    // 그래도 표시는 남는다 — 검수자가 알아야 한다.
    expect(withMaterial.issues.map((i) => i.code)).toContain("no_sources");
  });
});

describe("gradeCandidate — LLM의 대표 실패", () => {
  it("출처가 없으면 크게 깎는다", () => {
    const r = gradeCandidate({ ...good(), sources: [] });
    expect(r.issues.map((i) => i.code)).toContain("no_sources");
    expect(r.confidence).toBeLessThanOrEqual(0.65);
  });

  it("상투어를 잡는다", () => {
    const r = gradeCandidate(
      good({ roamInterpretation: "다양한 조명을 만나보세요." }),
    );
    expect(r.issues.map((i) => i.code)).toContain("filler");
  });

  it("다른 부스에도 그대로 쓰인 행동을 잡는다", () => {
    // 프롬프트를 "짧은 구로" 조였더니 '책 구경하기'처럼 아무 부스에나 붙는
    // 말이 나왔다. 상투어 사전으로는 못 잡고, 배치 내 재사용으로 잡힌다.
    const r = gradeCandidate({
      ...good({ thingsToDo: ["책 구경하기", "단어 아카이브 살펴보기"] }),
      seenActions: new Set(["책 구경하기"]),
    });
    expect(r.issues.map((i) => i.code)).toContain("generic_action");
  });

  it("같은 배치에서 문장이 반복되면 크게 깎는다", () => {
    const line = "약통을 재사용한 드롭 램프가 시그니처야.";
    const r = gradeCandidate({
      ...good(),
      seenPhrases: new Set([line]),
    });
    expect(r.issues.map((i) => i.code)).toContain("duplicate_line");
    expect(r.confidence).toBeLessThanOrEqual(0.6);
  });

  it("신뢰도는 0 아래로 안 내려간다", () => {
    const r = gradeCandidate({
      booth,
      sources: [],
      payload: {
        roamInterpretation: "다양한 발견을 만나보세요",
        valueTags: [],
        recommendationReasons: { goods: "x" },
      },
      seenPhrases: new Set(["다양한 발견을 만나보세요"]),
    });
    expect(r.confidence).toBe(0);
    expect(r.issues.length).toBeGreaterThan(3);
  });
});

describe("근거 없는 부스에서 드러난 실패 — 마곡 50부스", () => {
  const base = {
    sources: [{ uri: "https://brand.co.kr", title: "brand.co.kr" }],
    booth: { name: "일동공예", company: "Hobby & Play / Kitchen & Tableware" },
  };

  it("추측으로 쓴 문장은 자동 통과할 수 없다", () => {
    const r = gradeCandidate({
      ...base,
      payload: {
        summary: "일동공예는 아이들을 위한 소꿉놀이 주방용품을 판매할 것으로 보인다.",
        roamInterpretation: "미니어처 주방용품을 만날 수 있어.",
        valueTags: [{ slug: "goods", strength: 0.7 }],
        recommendationReasons: { goods: "소품을 고르는 재미가 있어." },
      },
    });
    expect(r.issues.map((i) => i.code)).toContain("speculation");
    expect(r.confidence).toBeLessThan(0.95);
  });

  it("모른다고 적은 초안이 만점을 받지 않는다", () => {
    // 실제로 이 문장이 신뢰도 1.00으로 자동 반영됐다.
    const r = gradeCandidate({
      ...base,
      payload: {
        summary: "'아농'이라는 이름의 브랜드가 여럿 있지만, 해당 부스의 정확한 정보는 확인되지 않는다.",
        valueTags: [{ slug: "discovery", strength: 0.6 }],
      },
    });
    expect(r.issues.map((i) => i.code)).toContain("speculation");
  });

  it("출처가 전부 잡화몰·영상이면 근거로 세지 않는다", () => {
    const r = gradeCandidate({
      ...base,
      sources: [
        { uri: "https://etsy.com/x", title: "etsy.com" },
        { uri: "https://ebay.com/y", title: "ebay.com" },
        { uri: "https://hobbylobby.com/z", title: "hobbylobby.com" },
      ],
      payload: {
        summary: "일동공예는 미니어처 식기류를 만든다.",
        valueTags: [{ slug: "goods", strength: 0.7 }],
      },
    });
    expect(r.issues.map((i) => i.code)).toContain("weak_sources");
  });

  it("브랜드 자기 사이트가 섞여 있으면 근거로 인정한다", () => {
    const r = gradeCandidate({
      ...base,
      sources: [
        { uri: "https://etsy.com/x", title: "etsy.com" },
        { uri: "https://ildong-craft.co.kr", title: "ildong-craft.co.kr" },
      ],
      payload: {
        summary: "일동공예는 미니어처 식기류를 만든다.",
        valueTags: [{ slug: "goods", strength: 0.7 }],
      },
    });
    expect(r.issues.map((i) => i.code)).not.toContain("weak_sources");
  });

  it("부스 이름 없이 분류 이름을 주어로 쓰면 걸린다", () => {
    const r = gradeCandidate({
      ...base,
      payload: {
        summary: "Hobby & Play / Kitchen & Tableware는 주방용품과 놀이 소품을 판매하는 브랜드다.",
        valueTags: [{ slug: "goods", strength: 0.7 }],
      },
    });
    expect(r.issues.map((i) => i.code)).toContain("category_readback");
  });

  it("부스 이름이 나오면 분류를 언급해도 되읽기가 아니다", () => {
    const r = gradeCandidate({
      ...base,
      payload: {
        summary: "일동공예는 Hobby & Play 구역에서 손으로 깎은 목기를 선보인다.",
        valueTags: [{ slug: "goods", strength: 0.7 }],
      },
    });
    expect(r.issues.map((i) => i.code)).not.toContain("category_readback");
  });

  it("\"선보인다\"는 추측이 아니다", () => {
    const r = gradeCandidate({
      ...base,
      payload: {
        summary: "일동공예는 손으로 깎은 목기를 선보인다.",
        valueTags: [{ slug: "goods", strength: 0.7 }],
      },
    });
    expect(r.issues.map((i) => i.code)).not.toContain("speculation");
  });
});
