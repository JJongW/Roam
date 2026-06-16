import { createServerClient as createSsrClient } from "@supabase/ssr";
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
