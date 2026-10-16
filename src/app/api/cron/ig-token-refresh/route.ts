import { ok } from "@/lib/api/http";
import { createServiceClient } from "@/lib/supabase/server";
import { env, hasSupabase } from "@/lib/env";
import { createTokenStore, refreshIgToken } from "@/lib/instagram/token";

/**
 * 인스타 장기 토큰 갱신(token.ts). Vercel Cron이 매일 부르고, 실제 갱신은 7일에 한 번.
 * 실패하면 500 — Vercel 대시보드의 cron 로그에 빨갛게 남는다. 만료(60일)까지
 * 매일 다시 시도한다.
 *
 * 인증은 requeue-stale과 같다(`Authorization: Bearer $CRON_SECRET`). 응답에 토큰은
 * 절대 싣지 않는다.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("unauthorized", { status: 401 });
  }
  if (!hasSupabase) return ok({ status: "skipped", note: "supabase 미설정" });

  try {
    const result = await refreshIgToken(createTokenStore(createServiceClient()), env.IG_ACCESS_TOKEN);
    console.log(`[ig-token] ${JSON.stringify(result)}`);
    return ok(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`[ig-token] ${message}`);
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}
