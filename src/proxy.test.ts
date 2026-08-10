import { describe, expect, it } from "vitest";
import { PUBLIC_PATH_PATTERNS, PUBLIC_PATHS } from "@/proxy";

function isPublic(pathname: string): boolean {
  return PUBLIC_PATH_PATTERNS.some((re) => re.test(pathname));
}

describe("PUBLIC_PATH_PATTERNS", () => {
  it("전시 상세를 공개로 허용", () => {
    expect(isPublic("/exhibitions/sibf-2026")).toBe(true);
  });

  it("지도를 공개로 허용", () => {
    expect(isPublic("/exhibitions/sibf-2026/map")).toBe(true);
  });

  it("부스 상세를 공개로 허용", () => {
    expect(isPublic("/booths/b_a1406")).toBe(true);
  });

  it("메모장은 여전히 막는다(더 깊은 경로)", () => {
    expect(isPublic("/exhibitions/sibf-2026/notes")).toBe(false);
  });

  it("커뮤니티는 여전히 막는다", () => {
    expect(isPublic("/exhibitions/sibf-2026/community")).toBe(false);
  });

  it("전시 목록 자체(/exhibitions)는 이 패턴에 안 걸린다", () => {
    expect(isPublic("/exhibitions")).toBe(false);
  });
});

describe("PUBLIC_PATHS", () => {
  // Google OAuth verification 심사관은 계정 없이 이 URL을 직접 연다. 게이트가
  // 닫히면 로그인 화면으로 튕겨 심사가 반려된다 — 배열을 정리하다 실수로 빼는
  // 것을 막는다.
  it("개인정보처리방침은 로그인 없이 열려야 한다", () => {
    expect(PUBLIC_PATHS).toContain("/privacy");
  });

  it("서비스 약관도 로그인 없이 열려야 한다", () => {
    expect(PUBLIC_PATHS).toContain("/terms");
  });

  it("홈은 계속 공개", () => {
    expect(PUBLIC_PATHS).toContain("/");
  });
});
