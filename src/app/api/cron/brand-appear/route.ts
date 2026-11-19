import { ok } from "@/lib/api/http";
import { hasSupabase } from "@/lib/env";
import { getRepository } from "@/lib/repositories";
import { apnsConfigFromEnv, createApnsSender } from "@/lib/notifications/apns";
import { runBrandAppear } from "@/lib/notifications/run-brand-appear";

/**
 * 브랜드 알림 잡(하트 남긴 브랜드가 다음 박람회에 나와요). Vercel Cron이 매일 01:00 UTC(한국 10시)에 부른다.
 * Hobby 플랜 cron은 그 시간 안 아무 때나 돌아 한국 10시대에 돈다. 보내는 시간(10~20시) 안이다.
 *
 * 왜 워커(kr.roam.sweep, 09:30)가 아닌가: 09:30은 보내는 시간 밖이라 거기서 고르면 보내기를 따로 또
 * 돌려야 하고, 맥미니가 꺼져 있으면 알림이 멈춘다. 워커와 launchd를 고치려면 Ted 승인도 필요하다.
 * 결정 기록: docs/decisions/2026-11-19_브랜드-알림-서버.md
 *
 * 인증은 다른 cron과 같다(`Authorization: Bearer $CRON_SECRET`, 설정돼 있으면 검사).
 * 같은 날 여러 번 불러도 dedupe_key와 하루 한 번 제한 때문에 두 번 가지 않는다.
 * APNs 설정이 없으면 고르기만 하고 보내지 않는다(줄은 queued로 남는다).
 */
export const maxDuration = 60;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("unauthorized", { status: 401 });
  }
  if (!hasSupabase) return ok({ status: "skipped", note: "supabase 미설정" });

  const cfg = apnsConfigFromEnv();
  const sender = cfg.ok ? createApnsSender(cfg.config) : null;
  try {
    const repo = await getRepository();
    const report = await runBrandAppear(repo, { sender });
    const summary = {
      since: report.since,
      inWindow: report.inWindow,
      apns: cfg.ok ? "ready" : { missing: cfg.missing },
      match: report.match,
      deliver: { ...report.deliver, planned: report.deliver.planned.length },
    };
    console.log(`[brand-appear] ${JSON.stringify(summary)}`);
    return ok(summary);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`[brand-appear] ${message}`);
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: { "Content-Type": "application/json" } });
  } finally {
    sender?.close();
  }
}
