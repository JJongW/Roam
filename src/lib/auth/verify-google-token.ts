import { createRemoteJWKSet, jwtVerify } from "jose";
import { env } from "@/lib/env";

const GOOGLE_JWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/oauth2/v3/certs"),
);

export interface GoogleTokenClaims {
  sub: string;
  email?: string;
  name?: string;
  picture?: string;
}

/**
 * GIDSignIn(Google Sign-In iOS SDK)이 발급한 idToken을 Google JWKS로 서명
 * 검증한다. 실패 시 jose 에러를 그대로 던진다 — 호출부가 401로 매핑한다.
 */
export async function verifyGoogleIdToken(
  token: string,
): Promise<GoogleTokenClaims> {
  const { payload } = await jwtVerify(token, GOOGLE_JWKS, {
    issuer: ["https://accounts.google.com", "accounts.google.com"],
    audience: env.GOOGLE_IOS_CLIENT_ID,
  });
  return {
    sub: payload.sub as string,
    email: typeof payload.email === "string" ? payload.email : undefined,
    name: typeof payload.name === "string" ? payload.name : undefined,
    picture: typeof payload.picture === "string" ? payload.picture : undefined,
  };
}
