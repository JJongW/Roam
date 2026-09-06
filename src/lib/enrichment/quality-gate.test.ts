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
  it("로미 발화에 가치 이름을 쓰면 감점한다", () => {
    // "발견 쪽 부스야" 같은 분류 되읽기는 현장에서 정보가 아니었다.
    const r = gradeCandidate(good({ roamInterpretation: "발견 쪽 부스야." }));
    expect(r.issues.map((i) => i.code)).toContain("value_word_in_voice");
    expect(r.confidence).toBeLessThan(1);
  });

  it("부스명만 되풀이하면 감점한다", () => {
    const r = gradeCandidate(good({ roamInterpretation: "루이스폴센 부스야" }));
    expect(r.issues.map((i) => i.code)).toContain("name_only");
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
