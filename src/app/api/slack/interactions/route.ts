import { NextResponse } from "next/server";
import { getRepository } from "@/lib/repositories";
import { decideArticle } from "@/lib/articles/decision";
import { parseApprovers, SLACK_ACTION, slackEscape, verifySlackSignature } from "@/lib/articles/slack";
import type { ArticleAction } from "@/lib/articles/signed-link";

/**
 * 슬랙 앱 인터랙티브 버튼(아티클 승인, 반려). 슬랙 앱의 Interactivity Request URL이 여기다.
 *
 * 켜지는 조건: SLACK_SIGNING_SECRET이 있어야 한다. 없으면 404 — 설정 전엔 아무 요청도 받지 않는다.
 * 지키는 것:
 * - 서명(v0)과 5분 안의 시각을 검사한다(verifySlackSignature). 원문 본문으로 검사하므로 먼저 text로 읽는다.
 * - 누른 사람이 SLACK_APPROVER_USER_IDS에 있어야 한다. 비어 있으면 아무도 못 누른다.
 *   채널에 있는 누구나 공개를 결정하면 안 된다 — 결정은 Ted 몫이다.
 * - 결정은 관리자 화면과 같은 decideArticle(draft일 때만 바뀜)을 지난다.
 * 슬랙은 3초 안에 200을 기다린다. 결과 알림은 response_url로 보낸다.
 */
export async function POST(req: Request) {
  const secret = process.env.SLACK_SIGNING_SECRET;
  if (!secret) return new NextResponse(null, { status: 404 });

  const rawBody = await req.text();
  const v = verifySlackSignature({
    secret,
    timestamp: req.headers.get("x-slack-request-timestamp"),
    signature: req.headers.get("x-slack-signature"),
    rawBody,
  });
  if (!v.ok) return NextResponse.json({ error: v.reason }, { status: 401 });

  let payload: {
    type?: string;
    user?: { id?: string };
    actions?: { action_id?: string; value?: string }[];
    response_url?: string;
  };
  try {
    payload = JSON.parse(new URLSearchParams(rawBody).get("payload") ?? "");
  } catch {
    return NextResponse.json({ error: "payload" }, { status: 400 });
  }
  if (payload.type !== "block_actions") return new NextResponse(null, { status: 200 });

  const act = payload.actions?.find((a) => a.action_id === SLACK_ACTION.approve || a.action_id === SLACK_ACTION.reject);
  if (!act?.value) return new NextResponse(null, { status: 200 });
  const action: ArticleAction = act.action_id === SLACK_ACTION.approve ? "approve" : "reject";

  const userId = payload.user?.id ?? "";
  let reply: string;
  if (!parseApprovers(process.env.SLACK_APPROVER_USER_IDS).includes(userId)) {
    reply = "이 버튼으로 결정할 수 있는 사람이 아니에요. 관리자 화면에서 결정해 주세요.";
  } else {
    const repo = await getRepository();
    const r = await decideArticle(repo, act.value, action, `slack:${userId}`);
    if (r.ok) reply = `${action === "approve" ? "승인했어요" : "반려했어요"}: *${slackEscape(r.article.title)}* (<@${userId}>)`;
    else if (r.reason === "not-found") reply = "아티클을 찾을 수 없어요.";
    else reply = `이미 결정된 아티클이에요(${r.article.status === "approved" ? "승인됨" : "반려됨"}).`;
  }

  // response_url은 슬랙 도메인일 때만 부른다(다른 곳으로 요청을 흘리지 않게).
  if (payload.response_url && /^https:\/\/hooks\.slack\.com\//.test(payload.response_url)) {
    try {
      await fetch(payload.response_url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ response_type: "in_channel", replace_original: false, text: reply }),
      });
    } catch (e) {
      console.error("[slack] response_url 실패", e);
    }
  }
  return new NextResponse(null, { status: 200 });
}
