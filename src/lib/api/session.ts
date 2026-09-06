import { getRepository } from "@/lib/repositories";
import { getSessionId, getUserId, setSessionCookie } from "@/lib/api/http";
import type { User, VisitorSession } from "@/lib/types";

/**
 * Returns the current anonymous session, creating one (and setting the cookie)
 * if none exists. `exhibitionId` ties a freshly created session to an exhibition.
 */
export async function ensureSession(
  exhibitionId = "unknown",
): Promise<VisitorSession> {
  const repo = await getRepository();
  const id = await getSessionId();
  if (id) {
    const existing = await repo.getSession(id);
    if (existing) return existing;
  }
  const session = await repo.createSession(exhibitionId);
  await setSessionCookie(session.id);
  return session;
}

/**
 * Returns the signed-in user (nickname/Google 계정) or null if not logged in.
 *
 * iOS는 더 이상 `roam_user` 쿠키를 발급받지 않는다(Apple 로그인이 Supabase Auth로
 * 완전히 옮겨감, 2026-09-06) — 쿠키가 없으면 `Authorization: Bearer <supabase
 * access token>` 헤더를 대신 확인한다. `app_user.id`는 `auth.uid()`와 같은 값이라
 * (0041 RLS 전제, `api/auth/apple/link`와 동일 불변식) 검증된 id로 바로 조회하면
 * 된다 — 이 함수를 쓰는 15개 라우트 전부 시그니처를 안 바꿔도 된다(`headers()`가
 * `cookies()`처럼 요청 스코프에서 암묵적으로 동작).
 */
export async function getCurrentUser(): Promise<User | null> {
  const repo = await getRepository();

  const id = await getUserId();
  return id ? repo.getUser(id) : null;
}
