import { describe, expect, it } from "vitest";
import { signUserId, verifySignedUserId } from "@/lib/auth/user-cookie";

describe("roam_user 쿠키 서명", () => {
  it("서명한 값을 되읽으면 원래 id가 나온다", () => {
    const signed = signUserId("u_abc123");
    expect(verifySignedUserId(signed)).toBe("u_abc123");
  });

  // 이게 proxy 게이트 우회를 막는 케이스다. 서명 없는 raw id를 쿠키에 넣어도
  // 로그인으로 인정되면 안 된다(2026-08-27 감사).
  it("서명 없는 raw id는 거부한다", () => {
    expect(verifySignedUserId("u_abc123")).toBeNull();
  });

  it("아무 문자열이나 넣으면 거부한다", () => {
    expect(verifySignedUserId("forged")).toBeNull();
  });

  it("서명이 틀리면 거부한다", () => {
    expect(verifySignedUserId("u_abc123.notarealsignature")).toBeNull();
  });

  it("다른 id의 서명을 붙이면 거부한다", () => {
    const signature = signUserId("u_victim").split(".").pop();
    expect(verifySignedUserId(`u_attacker.${signature}`)).toBeNull();
  });

  it("id에 점이 들어 있어도 마지막 점 기준으로 갈라 통과한다", () => {
    const signed = signUserId("u.with.dots");
    expect(verifySignedUserId(signed)).toBe("u.with.dots");
  });
});
