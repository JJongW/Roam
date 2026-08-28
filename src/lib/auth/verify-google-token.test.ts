import { describe, expect, it, vi } from "vitest";

// env.GOOGLE_IOS_CLIENT_ID를 명시적으로 undefined로 만든다 — verifyGoogleIdToken이
// jwtVerify를 부르기도 전에 던지는지 검증하는 게 목적이라, jose/네트워크(JWKS fetch)는
// 이 테스트에서 전혀 필요 없다(mock하지 않는다).
vi.mock("@/lib/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/env")>();
  return { ...actual, env: { ...actual.env, GOOGLE_IOS_CLIENT_ID: undefined } };
});

import { verifyGoogleIdToken } from "./verify-google-token";

describe("verifyGoogleIdToken", () => {
  it("GOOGLE_IOS_CLIENT_ID 미설정이면 jwtVerify를 부르기 전에 던진다", async () => {
    await expect(verifyGoogleIdToken("any-token")).rejects.toThrow(
      "GOOGLE_IOS_CLIENT_ID is not configured",
    );
  });
});
