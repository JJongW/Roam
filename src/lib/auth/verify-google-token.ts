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
 *
 * env.GOOGLE_IOS_CLIENT_ID 미설정 가드를 라우트뿐 아니라 여기에도 둔다 — jose의
 * jwtVerify는 audience가 undefined면 aud claim 검증 자체를 건너뛴다(확인됨).
 * 라우트의 가드가 언젠가 리팩터로 빠지거나, 이 함수를 라우트 밖에서 직접 부르는
 * 경로가 생겨도 이 함수 자체가 무인증 우회를 구조적으로 막는다.
 */
export async function verifyGoogleIdToken(
  token: string,
): Promise<GoogleTokenClaims> {
  if (!env.GOOGLE_IOS_CLIENT_ID) {
    throw new Error("GOOGLE_IOS_CLIENT_ID is not configured");
  }
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
