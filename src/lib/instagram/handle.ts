import { matchRule, type DmRule } from "./rules";

/** Instagram API(Instagram 로그인) 웹훅의 `comments` 이벤트 모양. 쓰는 필드만. */
export interface IgWebhookPayload {
  object?: string;
  entry?: Array<{
    id?: string;
    changes?: Array<{
      field?: string;
      value?: {
        id?: string;
        text?: string;
        parent_id?: string;
        from?: { id?: string; username?: string };
        media?: { id?: string };
      };
    }>;
  }>;
}

export interface CommentEvent {
  commentId: string;
  text: string;
  mediaId?: string;
  fromId?: string;
  fromUsername?: string;
}

export interface HandleDeps {
  /** 우리 인스타 계정 ID. 이 계정이 단 댓글(우리 공개 답글 포함)은 무시한다. */
  igUserId: string;
  rules?: DmRule[];
  /** 댓글 하나를 처리하겠다고 선점한다. 이미 처리했으면 false(웹훅 재전송 중복 방지). */
  claim(event: CommentEvent, rule: DmRule): Promise<boolean>;
  sendPrivateReply(commentId: string, text: string): Promise<void>;
  replyToComment(commentId: string, text: string): Promise<void>;
  markResult(commentId: string, status: "sent" | "failed", error?: string): Promise<void>;
}

export type Outcome =
  | { commentId: string; result: "sent"; ruleId: string; publicReplyError?: string }
  | { commentId: string; result: "failed"; ruleId: string; error: string }
  | { commentId: string; result: "skipped"; reason: "own" | "no-match" | "duplicate" };

export function extractComments(payload: IgWebhookPayload): Array<CommentEvent & { accountId?: string }> {
  const out: Array<CommentEvent & { accountId?: string }> = [];
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const v = change.value;
      if (change.field !== "comments" || !v?.id || typeof v.text !== "string") continue;
      out.push({
        commentId: v.id,
        text: v.text,
        mediaId: v.media?.id,
        fromId: v.from?.id,
        fromUsername: v.from?.username,
        accountId: entry.id,
      });
    }
  }
  return out;
}

/**
 * 웹훅 한 건을 처리한다. 댓글마다: 내 댓글 거르기 → 규칙 매칭 → 선점(중복 방지)
 * → DM 발송 → (선택) 공개 답글.
 *
 * 선점을 발송보다 **먼저** 한다. Meta는 200을 늦게 받으면 같은 이벤트를 다시
 * 보내는데, 발송 뒤에 기록하면 그 사이 재전송이 DM을 두 번 보낸다. 대신 발송이
 * 실패하면 그 댓글은 failed로 남고 자동 재시도하지 않는다 — Private Reply는 댓글당
 * 한 번뿐이라, 애매하면 안 보내는 쪽이 낫다.
 */
export async function handleWebhook(
  payload: IgWebhookPayload,
  deps: HandleDeps,
): Promise<Outcome[]> {
  const outcomes: Outcome[] = [];
  for (const c of extractComments(payload)) {
    if (c.fromId && (c.fromId === deps.igUserId || c.fromId === c.accountId)) {
      outcomes.push({ commentId: c.commentId, result: "skipped", reason: "own" });
      continue;
    }
    const rule = matchRule(c.text, c.mediaId, deps.rules);
    if (!rule) {
      outcomes.push({ commentId: c.commentId, result: "skipped", reason: "no-match" });
      continue;
    }
    if (!(await deps.claim(c, rule))) {
      outcomes.push({ commentId: c.commentId, result: "skipped", reason: "duplicate" });
      continue;
    }
    try {
      await deps.sendPrivateReply(c.commentId, rule.message);
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      await deps.markResult(c.commentId, "failed", error);
      outcomes.push({ commentId: c.commentId, result: "failed", ruleId: rule.id, error });
      continue;
    }
    await deps.markResult(c.commentId, "sent");
    let publicReplyError: string | undefined;
    if (rule.publicReply) {
      // 공개 답글은 덤이다 — 실패해도 DM은 이미 갔으니 sent로 둔다.
      try {
        await deps.replyToComment(c.commentId, rule.publicReply);
      } catch (e) {
        publicReplyError = e instanceof Error ? e.message : String(e);
      }
    }
    outcomes.push({ commentId: c.commentId, result: "sent", ruleId: rule.id, publicReplyError });
  }
  return outcomes;
}
