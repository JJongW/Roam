import { createHmac, timingSafeEqual } from "node:crypto";
import { sessionSecret } from "@/lib/env";

/**
 * `roam_user` 쿠키 값의 서명/검증. next/headers에 의존하지 않아서 라우트 핸들러
 * (`lib/api/http.ts`)와 게이트(`src/proxy.ts`) 양쪽에서 같은 함수를 쓴다.
 *
 * 두 곳이 각자 판정하면 기준이 갈라진다 — proxy가 "쿠키가 있으면 통과"만 하고
 * http.ts는 서명을 검증하던 탓에, 위조 쿠키 하나로 게이트를 통과할 수 있었다.
 * "지금 로그인한 사람이 누구인가"에 답하는 자리는 하나여야 한다.
 */

/** id.signature — signature = HMAC-SHA256(id) so the cookie value can't be
 *  forged by pasting in someone else's user id (raw-id cookies let anyone who
 *  learns/guesses a user id become that user; see 2026-08-27 audit). */
export function signUserId(id: string): string {
  const signature = createHmac("sha256", sessionSecret)
    .update(id)
    .digest("base64url");
  return `${id}.${signature}`;
}

export function verifySignedUserId(signed: string): string | null {
  const dot = signed.lastIndexOf(".");
  if (dot === -1) return null; // pre-migration unsigned cookie — treat as logged out
  const id = signed.slice(0, dot);
  const signature = signed.slice(dot + 1);
  const expected = createHmac("sha256", sessionSecret)
    .update(id)
    .digest("base64url");
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return id;
}
