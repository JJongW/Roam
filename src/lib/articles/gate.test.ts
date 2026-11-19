import { describe, expect, it } from "vitest";
import { composeTemplate } from "./compose";
import { checkArticle, voiceCheck, type GateInput } from "./gate";
import { pickCandidates } from "./select";
import { world } from "./__fixtures__";
import type { ArticleSource } from "@/lib/types";

const SRC: ArticleSource[] = [
  { id: "exh:e1", kind: "exhibition", label: "새해 준비상점 행사 정보", origin: [], text: "새해 준비상점, 2026년 12월 4일부터 2026년 12월 6일까지, 킨텍스 제2전시장 6홀" },
  { id: "field:i1", kind: "profile_field", label: "하치 공식 소개 원문", origin: [], brandWritten: true, text: "하치(HACHI)는 단청의 문양을 재해석합니다. 스카프·파우치를 만듭니다." },
  { id: "field:items", kind: "profile_field", label: "하치 품목", origin: [], text: "스카프, 파우치" },
];

function input(over: Partial<GateInput> = {}): GateInput {
  return {
    title: "새해 준비상점에서 만나는 하치",
    excerpt: "하치는 새해 준비상점에 참가하는 브랜드예요.",
    body: [
      { type: "paragraph", text: "새해 준비상점은 2026년 12월 4일부터 12월 6일까지 열려요.", sourceIds: ["exh:e1"] },
      { type: "quote", text: "하치(HACHI)는 단청의 문양을 재해석합니다.", sourceId: "field:i1", attribution: "하치 공식 소개 원문" },
    ],
    sources: SRC,
    protectedTerms: ["하치", "HACHI", "새해 준비상점", "킨텍스 제2전시장 6홀"],
    ...over,
  };
}

describe("checkArticle — 통과", () => {
  it("해요체 문단과 원문 그대로의 인용은 통과한다(인용 속 합니다체와 가운뎃점은 브랜드 글이라 그대로)", () => {
    const r = checkArticle(input({
      body: [
        ...input().body,
        { type: "quote", text: "스카프·파우치를 만듭니다.", sourceId: "field:i1", attribution: "원문" },
      ],
    }));
    expect(r).toEqual({ ok: true, issues: [] });
  });

  it("틀 글쓴이가 만든 두 종류 판본이 모두 게이트를 넘는다", () => {
    const w = world();
    const intro = composeTemplate(pickCandidates(w, [], { kind: "brand_intro" })[0], w.fields);
    const roundup = composeTemplate(pickCandidates(w, [], { kind: "fair_roundup" })[0], w.fields);
    for (const d of [intro, roundup]) {
      const r = checkArticle({ ...d, derivedNumbers: d.derivedNumbers });
      expect(r.issues).toEqual([]);
    }
  });
});

describe("checkArticle — 말투(fail closed)", () => {
  const para = (text: string) => input({ body: [{ type: "paragraph", text, sourceIds: ["exh:e1"] }] });
  it.each([
    ["합니다체", "새해 준비상점은 킨텍스에서 열립니다."],
    ["반말", "새해 준비상점에 하치가 와."],
    ["한다체", "하치는 문양을 재해석한다."],
    ["전시", "하치의 전시를 볼 수 있어요."],
    ["가운뎃점", "스카프·파우치가 있어요."],
    ["대시", "하치 — 단청 브랜드예요."],
    ["과장", "올해 최고의 브랜드예요."],
    ["압박", "무조건 들러 보세요."],
    ["취향을 아는 척", "취향 저격 브랜드예요."],
    ["추천자 화법", "로미가 추천하는 브랜드예요."],
    ["호칭", "당신에게 맞는 브랜드예요."],
    ["1인칭", "제가 고른 브랜드예요."],
    ["명사로 끊긴 문장", "단청을 재해석하는 브랜드."],
    ["배제", "다른 부스는 안 봐도 돼요."],
  ])("%s: 막는다", (_, text) => {
    const r = checkArticle(para(text));
    expect(r.ok).toBe(false);
  });

  it("행사 고유명사 안의 '전시'는 가린다", () => {
    expect(voiceCheck("코엑스 전시홀 A에서 열려요.", ["코엑스 전시홀 A"], "prose")).toEqual([]);
    expect(voiceCheck("전시홀에서 열려요.", [], "prose").join()).toContain("전시");
  });

  it("이름 안의 가운뎃점도 Roam 글에선 막는다(공식 표기 예외만 둔다)", () => {
    expect(voiceCheck("고동상 · 고양이와 동그란 세상을 소개해요.", ["고동상 · 고양이와 동그란 세상"], "prose").join()).toContain("가운뎃점");
    expect(voiceCheck("동아시아·허블의 책이에요.", ["동아시아·허블"], "prose")).toEqual([]);
  });

  it("인용의 출처 표시도 Roam 글이라 검사한다", () => {
    const r = checkArticle(input({ body: [...input().body, { type: "quote", text: "하치(HACHI)는 단청의 문양을 재해석합니다.", sourceId: "field:i1", attribution: "하치·HACHI 원문" }] }));
    expect(r.issues.join()).toContain("가운뎃점");
  });

  it("브랜드 이름이 반말 끝처럼 보여도(…다, …나) 이름은 가린다", () => {
    expect(voiceCheck("새해 준비상점에서 만나는 바다", ["바다", "새해 준비상점"], "label")).toEqual([]);
  });

  it("느낌표는 한 편에 하나까지", () => {
    const r = checkArticle(input({
      body: [
        { type: "paragraph", text: "새해 준비상점에서 만나요!", sourceIds: ["exh:e1"] },
        { type: "paragraph", text: "하치가 와요!", sourceIds: ["exh:e1"] },
      ],
    }));
    expect(r.issues.join()).toContain("느낌표");
  });
});

describe("checkArticle — 근거", () => {
  it("출처에 없는 숫자는 막는다", () => {
    const r = checkArticle(input({ body: [{ type: "paragraph", text: "하치는 올해 300개를 팔았어요.", sourceIds: ["exh:e1"] }] }));
    expect(r.issues.join()).toContain("300");
  });
  it("출처에 없는 영문 표기는 막는다", () => {
    const r = checkArticle(input({ body: [{ type: "paragraph", text: "하치는 BEST 브랜드예요.", sourceIds: ["exh:e1"] }] }));
    expect(r.issues.join()).toContain("BEST");
  });
  it("원문과 한 글자라도 다른 인용은 막는다", () => {
    const r = checkArticle(input({ body: [{ type: "quote", text: "하치(HACHI)는 단청 문양을 재해석해요.", sourceId: "field:i1", attribution: "x" }, ...input().body.slice(0, 1)] }));
    expect(r.issues.join()).toContain("인용이 원문과 달라요");
  });
  it("브랜드가 쓴 글이 아닌 출처는 인용할 수 없다", () => {
    const r = checkArticle(input({ body: [...input().body, { type: "quote", text: "스카프", sourceId: "field:items", attribution: "x" }] }));
    expect(r.issues.join()).toContain("브랜드가 쓴 글이 아닌");
  });
  it("출처 없는 문단, 목록에 없는 출처는 막는다", () => {
    expect(checkArticle(input({ body: [{ type: "paragraph", text: "열려요.", sourceIds: [] }] })).ok).toBe(false);
    expect(checkArticle(input({ body: [{ type: "paragraph", text: "열려요.", sourceIds: ["nope"] }] })).issues.join()).toContain("nope");
  });
});
