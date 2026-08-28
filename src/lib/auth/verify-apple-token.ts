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
 */
export async function verifyAppleIdentityToken(
  token: string,
): Promise<AppleTokenClaims> {
  const { payload } = await jwtVerify(token, APPLE_JWKS, {
    issuer: "https://appleid.apple.com",
    audience: env.APPLE_BUNDLE_ID,
  });
  return {
    sub: payload.sub as string,
    email: typeof payload.email === "string" ? payload.email : undefined,
  };
}
