import { getRepository } from "@/lib/repositories";
import {
  getBearerUserId,
  getSessionId,
  getUserId,
  setSessionCookie,
} from "@/lib/api/http";
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
 * 쿠키냐 Bearer냐는 여기서 안 가린다 — getUserId()가 답한다. iOS는 더 이상
 * `roam_user` 쿠키를 발급받지 않고(Apple 로그인이 Supabase Auth로 완전히 옮겨감,
 * 2026-09-06) `Authorization: Bearer <supabase access token>`으로 오는데, 그
 * 폴백을 이 함수와 getUserId()가 각각 들고 있으면 한쪽만 고쳐지는 일이 실제로
 * 났다(analytics_event.user_id가 iOS에서 전부 null로 쌓임). "지금 로그인한
 * 사람이 누구인가"에 답하는 자리는 하나여야 한다.
 */
export async function getCurrentUser(): Promise<User | null> {
  const repo = await getRepository();

  const id = await getUserId();
  if (id) {
    const user = await repo.getUser(id);
    if (user) return user;
  }

  // 쿠키가 가리키던 계정이 이미 없어졌을 수 있다 — 같은 이메일 계정 병합
  // (`link_app_user_by_email`)이 옛 행을 지우기 때문에, 병합 전에 발급된 쿠키를
  // 든 기기는 그때부터 죽은 id를 계속 보낸다. 그 상태로 멈추면 유효한 Bearer
  // 토큰을 들고 와도 영원히 401이라, 신원을 한 번 더 물어본다.
  const bearerId = await getBearerUserId();
  if (!bearerId || bearerId === id) return null;
  return repo.getUser(bearerId);
}
