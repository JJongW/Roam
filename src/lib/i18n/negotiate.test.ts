import { describe, expect, it } from "vitest";
import { negotiate } from "@/lib/i18n/negotiate";

// 쿠키 없는 첫 방문자의 언어를 정하는 유일한 근거. 예전엔 이 자리에서 화면 전체를
// 덮는 언어 선택 게이트를 띄웠고, 그게 홈페이지를 가려 Google OAuth 인증이 반려됐다.
describe("negotiate", () => {
  it("헤더가 없으면 기본(ko)", () => {
    expect(negotiate(null)).toBe("ko");
    expect(negotiate(undefined)).toBe("ko");
    expect(negotiate("")).toBe("ko");
  });

  it("영어 브라우저는 en", () => {
    expect(negotiate("en-US,en;q=0.9")).toBe("en");
  });

  it("한국어 브라우저는 ko", () => {
    expect(negotiate("ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7")).toBe("ko");
  });

  it("q 값이 큰 쪽을 고른다 — 나열 순서가 아니라 가중치", () => {
    expect(negotiate("en;q=0.5,ko;q=0.9")).toBe("ko");
    expect(negotiate("ko;q=0.3,en;q=0.8")).toBe("en");
  });

  it("q 없는 항목은 1로 친다(사양 기본값)", () => {
    expect(negotiate("en,ko;q=0.9")).toBe("en");
  });

  it("지원하지 않는 언어만 있으면 기본(ko)", () => {
    expect(negotiate("fr-FR,fr;q=0.9,de;q=0.8")).toBe("ko");
  });

  it("지원 언어가 뒤에 있어도 찾아낸다", () => {
    expect(negotiate("fr-FR,fr;q=0.9,en;q=0.5")).toBe("en");
  });

  it("q=0은 '원하지 않음'이라 후보에서 뺀다", () => {
    expect(negotiate("en;q=0,fr;q=0.9")).toBe("ko");
  });

  it("지역 서브태그는 기본 태그로 잘라 본다", () => {
    expect(negotiate("en-GB")).toBe("en");
    expect(negotiate("ko-KR")).toBe("ko");
  });

  it("대소문자와 공백이 섞여도 동작한다", () => {
    expect(negotiate(" EN-US , EN ;q=0.9 ")).toBe("en");
  });
});
