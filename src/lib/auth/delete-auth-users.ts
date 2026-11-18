import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { dataMode } from "@/lib/env";

/**
 * Supabase auth 사용자를 지운다(본인 계정 삭제, 2026-11-16 결정 "바로 지우기").
 * 이미 없는 사용자는 성공으로 친다. 남은 실패 id를 돌려준다 — 데이터는 이미 지웠으니
 * 화면은 막지 않고, 라우트가 오류 로그로 남긴다.
 *
 * TODO(Apple 토큰 취소): App Store 5.1.1(v)는 Sign in with Apple 계정을 지울 때 Apple
 * REST API(/auth/revoke)로 토큰을 취소하라고 한다. 그러려면 서버에 Apple 클라이언트 시크릿
 * (팀 키로 서명한 JWT)과, iOS가 삭제 직전에 받은 authorizationCode로 얻은 refresh token이
 * 필요하다. 지금 서버엔 그 키가 없고 Supabase도 대신 취소하지 않는다. 키를 Ted가 만든 뒤
 * DELETE /api/me 본문에 appleAuthorizationCode를 받아 여기서 취소한다.
 */
export async function deleteAuthUsers(ids: string[]): Promise<string[]> {
  if (dataMode !== "supabase" || ids.length === 0) return [];
  const admin = createServiceClient().auth.admin;
  const failed: string[] = [];
  for (const id of ids) {
    const { error } = await admin.deleteUser(id);
    if (error && !/not.?found/i.test(error.message) && error.status !== 404) failed.push(id);
  }
  return failed;
}
