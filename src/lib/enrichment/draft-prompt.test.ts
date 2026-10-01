import { describe, expect, it } from "vitest";
import { draftSystemPrompt, draftUserPrompt, missingFields } from "./draft-prompt";
import { VALUE_SLUGS } from "@/lib/values";

describe("draftSystemPrompt", () => {
  it("여덟 가치 slug을 전부 싣는다 — 캐논 밖 값을 쓰지 않게", () => {
    const p = draftSystemPrompt();
    for (const s of VALUE_SLUGS) expect(p).toContain(s);
  });

  it("품질 게이트가 잡는 규칙을 프롬프트도 말한다", () => {
    // 게이트가 사후에 잡는 것과 프롬프트가 사전에 막는 것이 같아야, 걸리는 초안이
    // 줄어든다. 둘이 어긋나면 계속 감점만 나고 이유를 모른다.
    const p = draftSystemPrompt();
    expect(p).toContain("반말");
    expect(p).toContain("가치 이름");
    expect(p).toContain("지어내지 않는다");
    expect(p).toContain("상투어");
  });
});

describe("missingFields", () => {
  it("비어 있는 필드만 고른다", () => {
    expect(missingFields({ summary: "있음", thingsToDo: ["a"] })).toEqual([
      "roamInterpretation",
      "valueTags",
      "recommendationReasons",
      "timing",
      "memoryHooks",
    ]);
  });

  it("아무것도 없으면 7종 전부", () => {
    expect(missingFields(undefined)).toHaveLength(7);
  });

  it("공백만 있는 문자열은 비어 있는 것으로 본다", () => {
    expect(missingFields({ summary: "   " })).toContain("summary");
  });
});

describe("draftUserPrompt", () => {
  const booth = {
    code: "C01",
    name: "루이스폴센",
    company: "루이스폴센",
    description: "덴마크 조명 브랜드",
    tags: ["collect"],
  };

  it("이미 있는 값을 재료로 주되 채울 필드에선 뺀다", () => {
    const p = draftUserPrompt({
      booth,
      existing: { roamInterpretation: "사람이 쓴 한 줄" },
      missing: ["thingsToDo"],
    });
    expect(p).toContain("사람이 쓴 한 줄"); // 재료로는 준다
    expect(p).toContain("채울 필드: thingsToDo"); // 다시 쓰라고는 안 한다
    expect(p).not.toContain("채울 필드: roamInterpretation");
  });

  it("없는 정보는 비우라고 명시한다 — 지어내기 방지", () => {
    const p = draftUserPrompt({ booth, missing: ["timing"] });
    expect(p).toContain("못 찾으면 해당 필드를 비운다");
  });

  it("회사명이 부스명과 같으면 중복해서 넣지 않는다", () => {
    const p = draftUserPrompt({ booth, missing: ["summary"] });
    expect(p).not.toContain("회사/브랜드");
  });
});

// 품질 게이트는 근거가 이 부스의 확인된 주소에 닿아야 자동 통과시킨다. 그런데
// 초안기는 그 주소를 몰랐다 — 닿는 건 검색 운이었다(주류박람회 186건 중 157건 unanchored).
describe("draftUserPrompt — 확인된 주소", () => {
  const booth = { code: "H-06", name: "천비향", company: "좋은술", description: "", tags: [] };

  it("확인된 웹사이트·인스타를 싣는다", () => {
    const p = draftUserPrompt({
      booth: { ...booth, websiteUrl: "https://www.cheonbihyang.com", instagramUrl: "https://www.instagram.com/cheonbihyang" },
      missing: ["summary"],
    });
    expect(p).toContain("https://www.cheonbihyang.com");
    expect(p).toContain("https://www.instagram.com/cheonbihyang");
  });

  it("주소가 없으면 그 줄을 쓰지 않는다", () => {
    expect(draftUserPrompt({ booth, missing: ["summary"] })).not.toContain("공식 주소");
  });
});

describe("draftUserPrompt — 주최 소개 전문", () => {
  it("긴 소개(회사소개·제품)를 싣는다", () => {
    const p = draftUserPrompt({
      booth: { code: "H-06", name: "천비향", company: "좋은술", description: "짧은 소개", tags: [], longDescription: "주요 제품: 천비향약주, 화주" },
      missing: ["summary"],
    });
    expect(p).toContain("천비향약주, 화주");
  });
});

describe("draftSystemPrompt — 상투어 목록", () => {
  it("게이트가 잡는 상투어를 전부 싣는다", async () => {
    const { FILLER } = await import("./quality-gate");
    const p = draftSystemPrompt();
    for (const f of FILLER) expect(p).toContain(f);
  });
});
