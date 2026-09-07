import { ok } from "@/lib/api/http";
import { createServiceClient } from "@/lib/supabase/server";
import { hasSupabase } from "@/lib/env";

/**
 * 죽은 워커가 들고 있는 잡을 회수한다(0052의 `requeue_stale_jobs`).
 *
 * **왜 Vercel Cron인가**: 맥미니는 집 컴퓨터라 정전·재부팅·네트워크 끊김에
 * 노출된다(설계 §4). 그때 `running`으로 굳은 잡을 누군가 되돌려야 하는데, 그
 * 판단을 맥미니가 하면 맥미니가 죽었을 때 아무도 안 한다. 항상 떠 있는 쪽이 해야
 * 한다.
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
