import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

export interface SupabaseBearerUser {
  id: string;
  email?: string;
}

// iOS는 Supabase Auth(signInWithIdToken)로 직접 로그인해서 세션을 들고 있다 —
// 그 access token을 Authorization 헤더로 여기 보내면, 우리 서버는 이걸로 신원만
// 확인해서 app_user 프로필을 찾거나 만든다(link route 참고). 쿠키 기반
// createServerClient()(server.ts)는 브라우저 세션 전제라 네이티브 클라이언트의
// bearer 토큰엔 못 쓴다 — 그래서 별도로 뺐다.
export async function getSupabaseUserFromBearer(
  token: string,
): Promise<SupabaseBearerUser | null> {
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return null;
  }
  const supabase = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;
  return { id: data.user.id, email: data.user.email ?? undefined };
}
