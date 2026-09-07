import { ok } from "@/lib/api/http";
import { createServiceClient } from "@/lib/supabase/server";
import { hasSupabase } from "@/lib/env";

/**
 * 죽은 워커가 들고 있는 잡을 회수한다(0052의 `requeue_stale_jobs`).
 *
 * **회수의 본체는 워커 기동 시점이다.** 맥미니가 꺼져 있는 동안엔 잡을 되돌려봐야
 * 처리할 워커가 없다 — 실제로 값을 하는 건 워커가 돌아와서 자기 유령 잡을 치우는
 * 순간이고, 그건 worker/index.ts가 한다.
 *
 * 그럼 이건 왜 있나: **워커가 영영 안 돌아올 때 상태를 정직하게 만든다.** 그때
 * admin은 "running 3건"이 아니라 "queued 3건, 아무도 안 집는 중"을 봐야 한다.
 * 하루 한 번이면 충분하고, Vercel Hobby 플랜의 cron 상한(1일 1회)과도 맞는다 —
 * 15분 주기로 넣었다가 배포가 통째로 실패했다.
 *
 * 인증: Vercel Cron은 `Authorization: Bearer $CRON_SECRET`을 붙인다. 시크릿이
 * 설정돼 있으면 검사하고, 없으면(로컬·미설정) 통과시킨다 — 이 엔드포인트는
 * 파괴적이지 않다(멈춘 잡을 큐로 되돌릴 뿐).
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("unauthorized", { status: 401 });
  }
  if (!hasSupabase) return ok({ requeued: 0, note: "supabase 미설정" });

  const db = createServiceClient();
  const { data, error } = await db.rpc("requeue_stale_jobs", {});
  if (error) throw new Error(`잡 회수 실패: ${error.message}`);
  return ok({ requeued: Number(data ?? 0) });
}
