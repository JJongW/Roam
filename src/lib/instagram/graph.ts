import { env } from "@/lib/env";

/**
 * Instagram API(Instagram 로그인) 호출. 호스트는 graph.instagram.com —
 * Facebook 로그인 계열(graph.facebook.com)과 토큰이 호환되지 않는다.
 */
function baseUrl(): string {
  return `https://graph.instagram.com/${env.IG_GRAPH_VERSION ?? "v23.0"}`;
}

interface GraphError {
  error?: { message?: string; code?: number };
}

async function post(path: string, body: unknown): Promise<unknown> {
  const res = await fetch(`${baseUrl()}/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.IG_ACCESS_TOKEN}`,
    },
    body: JSON.stringify(body),
  });
  // 실패 응답도 JSON이 아닐 수 있다(게이트웨이 HTML 등) — 파싱 실패는 빈 객체로 본다.
  const json = (await res.json().catch(() => ({}))) as GraphError;
  if (!res.ok || json.error) {
    const message = json.error?.message ?? res.statusText;
    const code = json.error?.code ?? "?";
    throw new Error(`Instagram API ${res.status}: ${message} (code ${code})`);
  }
  return json;
}

/**
 * 댓글 단 사람에게 DM(Private Reply)을 보낸다. 댓글당 한 번, 댓글 작성 후 7일 안에만
 * 가능하다. https://developers.facebook.com/docs/instagram-platform/private-replies/
 */
export async function sendPrivateReply(commentId: string, text: string): Promise<void> {
  await post(`${env.IG_USER_ID}/messages`, {
    recipient: { comment_id: commentId },
    message: { text },
  });
}

/** 댓글에 공개 답글을 단다. */
export async function replyToComment(commentId: string, text: string): Promise<void> {
  await post(`${commentId}/replies`, { message: text });
}
