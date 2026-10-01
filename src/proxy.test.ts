import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { PUBLIC_PATH_PATTERNS, PUBLIC_PATHS, proxy } from "@/proxy";
import { signUserId } from "@/lib/auth/user-cookie";
import { USER_COOKIE } from "@/lib/constants";

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

describe("proxy() 게이트", () => {
  const NOTES = "/exhibitions/sibf-2026/notes";

  function req(pathname: string, cookie?: string) {
    return new NextRequest(`http://localhost${pathname}`, {
      headers: cookie ? { cookie: `${USER_COOKIE}=${cookie}` } : {},
    });
  }

  // 존재만 보던 시절엔 이게 통과했다 — 통과하면 메모장·커뮤니티가 서버 렌더되고,
  // 그 페이지들은 신원을 따로 확인하지 않는다.
  it("위조 쿠키로는 보호 경로를 못 지나간다", () => {
    const res = proxy(req(NOTES, "forged"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/login");
    expect(res.headers.get("location")).toContain(encodeURIComponent(NOTES));
  });

  it("쿠키가 아예 없어도 보호 경로는 막힌다", () => {
    expect(proxy(req(NOTES)).status).toBe(307);
  });

  it("유효 서명 쿠키는 보호 경로를 지나간다", () => {
    const res = proxy(req(NOTES, signUserId("u_abc123")));
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
  });

  it("공개 경로는 쿠키 없이도 열린다", () => {
    expect(proxy(req("/exhibitions/sibf-2026")).status).toBe(200);
  });

  // 여기가 닫히면 Google OAuth 심사가 반려된다.
  it("개인정보처리방침·약관은 위조 쿠키 검사 전에 통과한다", () => {
    expect(proxy(req("/privacy")).status).toBe(200);
    expect(proxy(req("/terms")).status).toBe(200);
  });
});
