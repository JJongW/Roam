import { clearUserCookie, fail, getBearerUserId, ok } from "@/lib/api/http";
import { getCurrentUser } from "@/lib/api/session";
import { getRepository } from "@/lib/repositories";
import { deleteAuthUsers } from "@/lib/auth/delete-auth-users";

/**
 * 본인 계정 삭제(UI 15-11~15-13, 2026-11-16 결정: 바로 지운다).
 *
 * 지우는 것: 부스 노트(하트, 다녀왔어요, 평가, 메모), 신호 원장, 브레인, 동선, 북마크,
 * 리뷰, 커뮤니티 글, 브랜드 하트, 기기 토큰, 계정 행, Supabase auth 사용자.
 * 끊는 것: 이용 기록(analytics_event)과 오류 로그의 계정 연결(행은 남고 누구 것인지는 사라진다).
 * 기기에 남은 기록은 앱이 지운다(서버는 기기를 못 지운다).
 *
 * Apple 토큰 취소는 아직 없다 — lib/auth/delete-auth-users.ts의 TODO.
 */
export async function DELETE() {
  const user = await getCurrentUser();
  if (!user) return fail("UNAUTHORIZED", "로그인이 필요해요");
  const repo = await getRepository();

  // auth 사용자 id는 계정 행을 지우기 전에 읽어 둔다.
  const bearerId = await getBearerUserId();
  const authIds = [
    ...new Set([...(await repo.getAuthUserIds(user.id)), ...(bearerId ? [bearerId] : [])]),
  ];

  const deleted = await repo.deleteUser(user.id);
  if (!deleted) return fail("NOT_FOUND", "계정을 찾을 수 없어요");

  const failed = await deleteAuthUsers(authIds);
  if (failed.length) {
    console.error("[DELETE /api/me] auth 사용자 삭제 실패", { userId: user.id, failed });
  }
  await clearUserCookie();
  return ok({ deleted: true, authUserDeleted: failed.length === 0 });
}
