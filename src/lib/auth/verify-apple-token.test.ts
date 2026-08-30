import { describe, expect, it, vi } from "vitest";

// env.APPLE_BUNDLE_ID를 명시적으로 undefined로 만든다 — verifyAppleIdentityToken이
// jwtVerify를 부르기도 전에 던지는지 검증하는 게 목적이라, jose/네트워크(JWKS fetch)는
// 이 테스트에서 전혀 필요 없다(mock하지 않는다).
vi.mock("@/lib/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/env")>();
  return { ...actual, env: { ...actual.env, APPLE_BUNDLE_ID: undefined } };
});

import { verifyAppleIdentityToken } from "./verify-apple-token";

describe("verifyAppleIdentityToken", () => {
  it("APPLE_BUNDLE_ID 미설정이면 jwtVerify를 부르기 전에 던진다", async () => {
    await expect(verifyAppleIdentityToken("any-token")).rejects.toThrow(
      "APPLE_BUNDLE_ID is not configured",
    );
  });
});
