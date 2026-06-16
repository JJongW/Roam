import { createBrowserClient } from "@supabase/ssr";
import { env } from "@/lib/env";

/** 브라우저(클라이언트 컴포넌트)용 Supabase 클라이언트. */
export function createClient() {
  return createBrowserClient(
    env.NEXT_PUBLIC_SUPABASE_URL!,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
