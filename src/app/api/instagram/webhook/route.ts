import { env, hasInstagramDm } from "@/lib/env";
import { handleWebhook, type IgWebhookPayload } from "@/lib/instagram/handle";
import { verifyMetaSignature } from "@/lib/instagram/signature";
import { replyToComment, sendPrivateReply } from "@/lib/instagram/graph";
import { createDmStore } from "@/lib/instagram/store";

// 서명 검증에 node:crypto가 필요하다.
export const runtime = "nodejs";

function text(body: string, status: number) {
  return new Response(body, { status, headers: { "Content-Type": "text/plain" } });
}

/** Meta 웹훅 등록 확인. 대시보드에 넣은 verify token이 맞으면 challenge를 그대로 돌려준다. */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const token = env.IG_WEBHOOK_VERIFY_TOKEN;
  if (
    token &&
    params.get("hub.mode") === "subscribe" &&
    params.get("hub.verify_token") === token
  ) {
    return text(params.get("hub.challenge") ?? "", 200);
  }
  return text("Forbidden", 403);
}

/**
 * 댓글 이벤트 수신. 응답 envelope(`ok()`)을 쓰지 않는다 — 호출자가 Meta라 우리 API
 * 규약이 아니라 Meta가 기대하는 평문 200을 돌려준다.
 */
export async function POST(req: Request) {
  if (!hasInstagramDm || !env.IG_APP_SECRET) {
    return text("Instagram DM not configured", 503);
  }
  // 서명은 파싱 전 원문으로 검증한다.
  const raw = await req.text();
  if (!verifyMetaSignature(raw, req.headers.get("x-hub-signature-256"), env.IG_APP_SECRET)) {
    return text("Invalid signature", 401);
  }
  let payload: IgWebhookPayload;
  try {
    payload = JSON.parse(raw) as IgWebhookPayload;
  } catch {
    return text("Bad JSON", 400);
  }

  try {
    const outcomes = await handleWebhook(payload, {
      igUserId: env.IG_USER_ID!,
      ...createDmStore(),
      sendPrivateReply,
      replyToComment,
    });
    // 요약만 남긴다 — 댓글·DM 본문과 토큰은 절대 로그에 쓰지 않는다.
    const counts: Record<string, number> = {};
    for (const o of outcomes) {
      const key = o.result === "skipped" ? `skipped:${o.reason}` : o.result;
      counts[key] = (counts[key] ?? 0) + 1;
    }
    console.log(`[ig-dm] webhook ${outcomes.length}건 ${JSON.stringify(counts)}`);
  } catch (e) {
    // DB 장애 등 — 500을 주면 Meta가 재전송한다. 선점(claim)이 있어 재전송돼도 DM은 한 번만 간다.
    console.error(`[ig-dm] webhook 처리 실패: ${e instanceof Error ? e.message : String(e)}`);
    return text("Internal error", 500);
  }
  return text("EVENT_RECEIVED", 200);
}
