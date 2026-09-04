// @vitest-environment node
//
// jsdom의 TextEncoder가 Node 네이티브와 다른 realm의 Uint8Array를 만들어서
// jose의 instanceof 체크가 깨진다("payload must be an instance of Uint8Array") —
// 서명/검증은 실제 암호화라 jsdom이 아니라 node 환경에서 돌려야 한다.
import { describe, expect, it, vi } from "vitest";
import { jwtVerify } from "jose";

describe("mintSupabaseAccessToken", () => {
  it("SUPABASE_JWT_SECRET 미설정이면 null", async () => {
    vi.resetModules();
    vi.doMock("@/lib/env", async (importOriginal) => {
      const actual = await importOriginal<typeof import("@/lib/env")>();
      return {
        ...actual,
        env: { ...actual.env, SUPABASE_JWT_SECRET: undefined },
      };
    });
    const { mintSupabaseAccessToken } = await import("./supabase-jwt");
    expect(await mintSupabaseAccessToken("user-1")).toBeNull();
  });

  it("설정돼 있으면 sub=userId, role=authenticated인 JWT를 서명한다", async () => {
    vi.resetModules();
    vi.doMock("@/lib/env", async (importOriginal) => {
      const actual = await importOriginal<typeof import("@/lib/env")>();
      return {
        ...actual,
        env: { ...actual.env, SUPABASE_JWT_SECRET: "test-secret-value" },
      };
    });
    const { mintSupabaseAccessToken } = await import("./supabase-jwt");
    const token = await mintSupabaseAccessToken("user-1");
    expect(token).not.toBeNull();

    const { payload } = await jwtVerify(
      token!,
      new TextEncoder().encode("test-secret-value"),
    );
    expect(payload.sub).toBe("user-1");
    expect(payload.role).toBe("authenticated");
    expect(payload.aud).toBe("authenticated");
  });
});
