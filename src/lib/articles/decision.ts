// 승인과 반려 — 관리자 화면, 슬랙 링크, 슬랙 버튼이 모두 이 함수 하나를 지난다.
//
// 상태 기계: draft → approved | rejected. 결정된 행은 다시 바뀌지 않는다(되돌리기는 이번 범위 밖).
// 저장소가 compare-and-set(status = 'draft'일 때만)으로 막으므로 두 번 눌러도, 링크와 버튼이
// 동시에 와도 한 번만 바뀐다. 승인된 글만 공개 API에 나간다.
import type { Repository } from "@/lib/repositories/types";
import type { Article, ArticleStatus } from "@/lib/types";
import type { ArticleAction } from "./signed-link";

export const REJECT_REASON_MAX = 500;

const NEXT: Record<ArticleAction, Exclude<ArticleStatus, "draft">> = { approve: "approved", reject: "rejected" };

/** 순수 전이 규칙. 저장소 구현과 같은 규칙을 화면이 미리 보여 줄 때 쓴다. */
export function transition(
  current: ArticleStatus,
  action: ArticleAction,
): { ok: true; next: Exclude<ArticleStatus, "draft"> } | { ok: false; reason: "not-draft" } {
  if (current !== "draft") return { ok: false, reason: "not-draft" };
  return { ok: true, next: NEXT[action] };
}

export type DecisionResult =
  | { ok: true; article: Article }
  | { ok: false; reason: "not-found" }
  | { ok: false; reason: "not-draft"; article: Article };

export async function decideArticle(
  repo: Repository,
  id: string,
  action: ArticleAction,
  actor: string | null,
  reason?: string | null,
): Promise<DecisionResult> {
  const r = reason?.trim() ? reason.trim().slice(0, REJECT_REASON_MAX) : null;
  return repo.decideArticle(id, { status: NEXT[action], actor, reason: action === "reject" ? r : null });
}

export const STATUS_LABEL: Record<ArticleStatus, string> = {
  draft: "승인 대기",
  approved: "승인됨",
  rejected: "반려됨",
};

/** 공개 API가 내보내는 모양. 게이트 기록, 결정한 사람, 반려 이유는 내보내지 않는다. */
export function publicArticle(a: Article) {
  return {
    id: a.id,
    kind: a.kind,
    title: a.title,
    excerpt: a.excerpt,
    body: a.body,
    sources: a.sources.map((s) => ({ id: s.id, kind: s.kind, label: s.label, origin: s.origin.filter((o) => /^https?:\/\//.test(o)) })),
    exhibitorIds: a.exhibitorIds,
    exhibitionIds: a.exhibitionIds,
    publishedAt: a.decidedAt,
  };
}
