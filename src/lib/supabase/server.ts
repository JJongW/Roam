import { createServerClient as createSsrClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { env } from "@/lib/env";

/**
 * 서버(Server Component / Route Handler)용 Supabase 클라이언트.
 * Next 16 에서 cookies() 는 Promise 이므로 await 한다.
 */
export async function createServerClient() {
  const cookieStore = await cookies();
  return createSsrClient(
    env.NEXT_PUBLIC_SUPABASE_URL!,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Server Component 에서 호출되면 set 이 막힌다. 미들웨어/Route Handler 에서
            // 세션이 갱신되므로 무시 가능.
          }
        },
      },
    },
  );
}

/**
 * 서비스 롤 키로 만든 클라이언트 — RLS를 통째로 우회한다. anon 키(위 createServerClient)로
 * 부스를 수정하면 조용히 0행으로 끝난다: booth 테이블 RLS가 방문객 세션에 쓰기를 안 준
 * 게 정상이고, PostgREST는 그걸 에러로 안 던져서(운영 콘솔이 방문객과 같은 Supabase Auth
 * 세션 개념이 없다 — 자체 코드 게이트다) upsertNote 조회 후 null → 라우트가 "못 찾음"으로
 * 오인해 404를 냈다. 관리자 쓰기는 라우트에서 requireAdmin()으로 이미 서버측 인가를
 * 마쳤으니, 그 뒤엔 RLS 대신 이 클라이언트로 확실히 쓴다 — RLS는 인증 안 된 방문객
 * 요청을 막는 방어선이지 이미 인가된 관리자 콘솔을 막을 이유가 없다.
 *
 * 방문객 쓰기 경로(노트·북마크 등)는 절대 이 클라이언트로 바꾸지 않는다 — 그건 RLS가
 * 계속 "자기 것만" 지켜줘야 한다.
 */
export function createServiceClient() {
  if (!env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY가 없어 관리자 쓰기를 할 수 없습니다",
    );
  }
  return createClient(
    env.NEXT_PUBLIC_SUPABASE_URL!,
    env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
