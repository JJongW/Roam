import { describe, expect, it } from "vitest";
import {
  parseUserAgent,
  geoFromHeaders,
  redact,
  redactContext,
} from "./issue-capture-parse";

describe("parseUserAgent", () => {
  it("iPhone Safari를 인식한다", () => {
    const ua =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
    expect(parseUserAgent(ua)).toBe("iPhone · Safari");
  });

  it("Windows Chrome을 인식한다", () => {
    const ua =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
    expect(parseUserAgent(ua)).toBe("Windows · Chrome");
  });

  it("Android Chrome을 인식한다", () => {
    const ua =
      "Mozilla/5.0 (Linux; Android 14; SM-S911N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";
    expect(parseUserAgent(ua)).toBe("Android · Chrome");
  });

  it("빈 값이면 undefined", () => {
    expect(parseUserAgent(undefined)).toBeUndefined();
    expect(parseUserAgent("")).toBeUndefined();
  });

  it("못 알아보는 UA는 원문 없이 undefined", () => {
    expect(parseUserAgent("curl/8.0")).toBeUndefined();
  });
});

describe("geoFromHeaders", () => {
  it("country·city 헤더를 읽는다", () => {
    const headers: Record<string, string> = {
      "x-vercel-ip-country": "KR",
      "x-vercel-ip-city": "Seoul",
    };
    const get = (name: string) => headers[name] ?? null;
    expect(geoFromHeaders(get)).toEqual({ country: "KR", city: "Seoul" });
  });

  it("헤더가 없으면(로컬 개발) 빈 객체", () => {
    expect(geoFromHeaders(() => null)).toEqual({});
  });

  it("도시만 없을 수도 있다", () => {
    const get = (name: string) =>
      name === "x-vercel-ip-country" ? "KR" : null;
    expect(geoFromHeaders(get)).toEqual({ country: "KR" });
  });
});

describe("redact", () => {
  it("이메일을 마스킹한다", () => {
    expect(redact("failed for foo@bar.com")).toBe("failed for [masked]");
  });

  it("JWT를 마스킹한다", () => {
    const jwt =
      "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U";
    expect(redact(`token=${jwt}`)).toBe("token=[masked]");
  });

  it("Bearer 토큰을 마스킹한다", () => {
    expect(redact("Authorization: Bearer abc123.def456")).toBe(
      "Authorization: [masked]",
    );
  });

  it("자체 리소스 ID는 마스킹하지 않는다 — 디버깅 맥락 보존", () => {
    expect(redact("booth booth_abc12345xyz789 not found")).toBe(
      "booth booth_abc12345xyz789 not found",
    );
  });

  it("알려진 API 키 접두사를 마스킹한다", () => {
    expect(redact("key=sk-abcdefghijklmnop")).toBe("key=[masked]");
    expect(redact("key=AIzaSyAbCdEfGhIjKlMnOp")).toBe("key=[masked]");
  });

  it("undefined는 undefined", () => {
    expect(redact(undefined)).toBeUndefined();
  });
});

describe("redactContext", () => {
  it("객체 안 문자열 값도 마스킹한다", () => {
    expect(
      redactContext({ email: "a@b.com", boothId: "booth_xyz123" }),
    ).toEqual({
      email: "[masked]",
      boothId: "booth_xyz123",
    });
  });

  it("중첩 객체 안 문자열도 마스킹한다", () => {
    expect(redactContext({ user: { email: "a@b.com" } })).toEqual({
      user: { email: "[masked]" },
    });
  });

  it("배열 값 안 문자열도 마스킹한다(안전한 값은 그대로)", () => {
    expect(redactContext({ tags: ["a@b.com", "safe"] })).toEqual({
      tags: ["[masked]", "safe"],
    });
  });

  it("undefined는 undefined", () => {
    expect(redactContext(undefined)).toBeUndefined();
  });
});
