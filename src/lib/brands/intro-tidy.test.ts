import { describe, expect, it } from "vitest";
import {
  INTRO_MAX_PARAGRAPHS,
  INTRO_MAX_PARAGRAPH_CHARS,
  contactBits,
  introFormatIssues,
  stripContactBits,
  tidyIntroText,
  toParagraphs,
} from "./intro-tidy";

describe("stripContactBits", () => {
  it("인스타 아이디, 링크, 메일, 해시태그, 이모지를 뺀다", () => {
    const s = stripContactBits("손으로 그린 엽서를 만들어요 ✨ @kibak_studio 에서 소식 전해요 #새해 #엽서 https://kibak.com/shop hello@kibak.com");
    expect(s).not.toMatch(/@|#|https|✨|kibak\.com/);
    expect(s).toContain("손으로 그린 엽서를 만들어요");
  });

  it("연락처를 빼고 안내 낱말만 남은 줄은 통째로 지운다", () => {
    const s = stripContactBits("도자기 컵을 빚어요.\nInstagram : @cup.studio\n홈페이지 www.cup.kr\n문의 DM");
    expect(s.split("\n").filter(Boolean)).toEqual(["도자기 컵을 빚어요."]);
  });

  it("작품명의 영문과 숫자는 그대로 둔다", () => {
    expect(stripContactBits("2027 캘린더 'Daily Garden'을 만들어요.")).toBe("2027 캘린더 'Daily Garden'을 만들어요.");
  });

  it("도메인처럼 보이는 웹 주소도 링크로 본다", () => {
    expect(contactBits("heedagarden.com 에서 팔아요").map((b) => b.kind)).toEqual(["url"]);
    expect(contactBits("A.B 브랜드예요")).toEqual([]);
  });
});

describe("toParagraphs", () => {
  it("문장 중간 줄바꿈은 공백으로 잇고, 빈 줄과 문장이 끝난 줄바꿈은 문단 경계로 본다", () => {
    expect(toParagraphs("매년 새로운 주제로 영화를\n큐레이션해 캘린더를 만들어요.\n2027년에도 함께해요.\n\n\n좋은 하루예요.")).toEqual([
      "매년 새로운 주제로 영화를 큐레이션해 캘린더를 만들어요.",
      "2027년에도 함께해요.",
      "좋은 하루예요.",
    ]);
  });
});

describe("tidyIntroText", () => {
  it("문단 사이 빈 줄 하나, 문단 안 줄바꿈 없음, 최대 3문단", () => {
    const out = tidyIntroText("첫 문장이에요.\n둘째 문장이에요.\n셋째 문장이에요.\n넷째 문장이에요.\n다섯째 문장이에요.");
    const paras = out.split("\n\n");
    expect(paras.length).toBeLessThanOrEqual(INTRO_MAX_PARAGRAPHS);
    expect(paras.every((p) => !p.includes("\n"))).toBe(true);
    expect(out.replace(/\n\n/g, " ")).toBe("첫 문장이에요. 둘째 문장이에요. 셋째 문장이에요. 넷째 문장이에요. 다섯째 문장이에요.");
  });

  it("한 덩어리 장문은 문장 경계에서 나눈다", () => {
    const long = Array.from({ length: 8 }, (_, i) => `그림책과 독립출판 작업을 ${i + 1}번째로 이어 가고 있어요.`).join(" ");
    const paras = tidyIntroText(long).split("\n\n");
    expect(paras.length).toBeGreaterThanOrEqual(2);
    expect(paras.every((p) => p.length <= INTRO_MAX_PARAGRAPH_CHARS)).toBe(true);
    expect(paras.every((p) => /요\.$/.test(p))).toBe(true);
  });

  it("가운뎃점은 쉼표로, 목록 머리표와 꾸밈 기호는 뺀다", () => {
    expect(tidyIntroText("• 수집·관찰·기록을 해요 ★")).toBe("수집, 관찰, 기록을 해요");
  });

  it("연락처만 있으면 빈 문자열", () => {
    expect(tidyIntroText("@abc\n#해시태그")).toBe("");
  });

  it("이미 정돈된 글은 그대로", () => {
    const ok = "키박은 책과 이미지로 솔직한 감정을 그려요.\n\n그림책과 독립출판, 그래픽 작업을 넘나들어요.";
    expect(tidyIntroText(ok)).toBe(ok);
  });
});

describe("introFormatIssues — 게이트가 걸러야 할 모양", () => {
  it("정돈된 글은 문제없음", () => {
    expect(introFormatIssues("도자기 컵을 빚어요.\n\n유약 색을 직접 섞어요.")).toEqual([]);
  });

  it("문단 안 줄바꿈", () => {
    expect(introFormatIssues("도자기 컵을\n빚어요.")).toContain("문단 안에서 줄이 바뀌었어요. 문단 사이에만 빈 줄을 두세요");
  });

  it("문단이 넷 이상", () => {
    expect(introFormatIssues("가요.\n\n나요.\n\n다요.\n\n라요.").some((i) => i.startsWith("문단이 4개"))).toBe(true);
  });

  it("한 덩어리 장문과 긴 문단", () => {
    const block = "가".repeat(150) + "요.";
    const issues = introFormatIssues(block);
    expect(issues).toContain("한 덩어리라 읽기 어려워요. 문단을 2~3개로 나눠 주세요");
    expect(issues.some((i) => i.startsWith("문단 하나가 너무 길어요"))).toBe(true);
  });

  it("전체가 너무 길면", () => {
    const p = "나".repeat(120) + "요.";
    expect(introFormatIssues([p, p, p].join("\n\n")).some((i) => i.startsWith("소개가 너무 길어요"))).toBe(true);
  });

  it("인스타 아이디, 링크, 메일, 해시태그, 이모지가 남으면", () => {
    const issues = introFormatIssues("@cup.studio 에서 봐요 🙂 #컵 https://cup.kr a@b.com");
    expect(issues).toEqual(
      expect.arrayContaining([
        "인스타 아이디가 남았어요: @cup.studio",
        "이모지가 남았어요: 🙂",
        "해시태그가 남았어요: #컵",
        "링크가 남았어요: https://cup.kr",
        "메일 주소가 남았어요: a@b.com",
      ]),
    );
  });
});
