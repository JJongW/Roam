import { createRemoteJWKSet, jwtVerify } from "jose";
import { env } from "@/lib/env";

const APPLE_JWKS = createRemoteJWKSet(
  new URL("https://appleid.apple.com/auth/keys"),
);

export interface AppleTokenClaims {
  sub: string;
  email?: string;
}

/**
 * Sign in with Apple의 identityToken(JWT)을 Apple JWKS로 서명 검증한다.
 * 실패(서명·만료·aud/iss 불일치)하면 jose가 던지는 에러를 그대로 던진다 —
 * 호출부(라우트)가 401로 매핑한다.
 *
 * env.APPLE_BUNDLE_ID 미설정 가드를 라우트뿐 아니라 여기에도 둔다 — jose의
 * jwtVerify는 audience가 undefined면 aud claim 검증 자체를 건너뛴다(확인됨).
 * 라우트의 가드가 언젠가 리팩터로 빠지거나, 이 함수를 라우트 밖에서 직접 부르는
 * 경로가 생겨도 이 함수 자체가 무인증 우회를 구조적으로 막는다.
 */
export async function verifyAppleIdentityToken(
  token: string,
): Promise<AppleTokenClaims> {
  if (!env.APPLE_BUNDLE_ID) {
    throw new Error("APPLE_BUNDLE_ID is not configured");
  }
  const { payload } = await jwtVerify(token, APPLE_JWKS, {
    issuer: "https://appleid.apple.com",
    audience: env.APPLE_BUNDLE_ID,
  });
  return {
    sub: payload.sub as string,
    email: typeof payload.email === "string" ? payload.email : undefined,
  };
}
