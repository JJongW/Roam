import { ok } from "@/lib/api/http";
import { getCurrentUser } from "@/lib/api/session";
import { readBrain } from "@/lib/memory/service";
import { mintSupabaseAccessToken } from "@/lib/auth/supabase-jwt";

// iOS가 1시간 만료되는 supabaseAccessToken(0041 RLS 참고)을 Apple 재로그인 없이
// 갱신하는 지점 — 기존 roam_user 쿠키 세션이 살아있는 동안은 여기 GET만으로
// 새 토큰을 다시 받을 수 있다.
export async function GET() {
  const user = await getCurrentUser();
  const needsOnboarding = user
    ? (await readBrain(user.id)).interests.length === 0
    : false;
  const supabaseAccessToken = user
    ? await mintSupabaseAccessToken(user.id)
    : null;
  return ok({ user, needsOnboarding, supabaseAccessToken });
}
