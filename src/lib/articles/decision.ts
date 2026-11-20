// 승인과 반려 — 관리자 화면, 슬랙 링크, 슬랙 버튼이 모두 이 함수 하나를 지난다.
//
// 상태 기계: draft → approved | rejected. 결정된 행은 다시 바뀌지 않는다(되돌리기는 이번 범위 밖).
// 저장소가 compare-and-set(status = 'draft'일 때만)으로 막으므로 두 번 눌러도, 링크와 버튼이
// 동시에 와도 한 번만 바뀐다. 승인된 글만 공개 API에 나간다.
import type { Repository } from "@/lib/repositories/types";
import type { Article, ArticleBlock, ArticlePhoto, ArticleStatus } from "@/lib/types";
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

/**
 * 공개 API가 내보내는 모양. 게이트 기록, 결정한 사람, 반려 이유는 내보내지 않는다.
 *
 * 사진은 허락 기록이 글 안에 있는 것만 내보낸다(사진 칸 출처 + 그 회차 사진 허락 출처). 게이트가 저장 전에
 * 이미 막지만, 공개 길에서 한 번 더 거른다 — 허락 없는 사진이 앱과 웹에 나가는 일은 되돌릴 수 없다.
 *
 * photos: 글 맨 위 사진 넘김(앱 UI 17 H-A, 11-19). 브랜드 이야기는 대표 사진 + 본문 사진,
 * 박람회 모음은 브랜드마다 첫 장. 한 장도 남지 않으면 그 글은 공개 목록에서 빠진다(isPublishable).
 */
export function publicArticle(a: Article) {
  const ok = permittedIn(a);
  return {
    id: a.id,
    kind: a.kind,
    title: a.title,
    excerpt: a.excerpt,
    hero: ok(a.hero) ? publicPhoto(a.hero) : null,
    photos: leadPhotos(a).filter(ok).map(publicPhoto),
    body: a.body.map((b) => publicBlock(b, ok)).filter((b): b is NonNullable<typeof b> => b !== null),
    // 허락 기록(연락 상태와 허락 범위)은 내부 정보라 내보내지 않는다. 사진의 permissionId도 지운다.
    sources: a.sources
      .filter((s) => s.kind !== "permission")
      .map((s) => ({ id: s.id, kind: s.kind, label: s.label, origin: s.origin.filter((o) => /^https?:\/\//.test(o)) })),
    exhibitorIds: a.exhibitorIds,
    exhibitionIds: a.exhibitionIds,
    publishedAt: a.decidedAt,
  };
}

/** 공개 목록과 한 편 조회에 낼 수 있나: 승인됐고, 허락 받은 사진이 한 장 이상 남는다(사진 필수, 11-19). */
export function isPublishable(a: Article): boolean {
  return a.status === "approved" && leadPhotos(a).some(permittedIn(a));
}

/** 사진 하나가 이 글 안의 허락 기록으로 뒷받침되나. */
function permittedIn(a: Article): (p: ArticlePhoto | null | undefined) => p is ArticlePhoto {
  const kinds = new Map(a.sources.map((s) => [s.id, s.kind]));
  return (p): p is ArticlePhoto => !!p && kinds.get(p.sourceId) === "photo" && kinds.get(p.permissionId) === "permission";
}

function leadPhotos(a: Article): ArticlePhoto[] {
  const out: ArticlePhoto[] = [];
  const add = (p: ArticlePhoto | undefined) => {
    if (p && !out.some((x) => x.path === p.path)) out.push(p);
  };
  if (a.kind === "fair_roundup") {
    for (const b of a.body) if (b.type === "brand-card") add(b.photos?.[0] ?? b.photo);
    if (!out.length) add(a.hero);
    return out;
  }
  add(a.hero);
  for (const b of a.body) {
    if (b.type === "photo") add(b.photo);
    if (b.type === "photo-group") b.photos.forEach(add);
  }
  return out;
}

/** 공개용 사진: 경로, 대체 글, 표기만. 허락 범위 원문과 출처 id는 내부용이다. */
export function publicPhoto(p: ArticlePhoto) {
  return { path: p.path, alt: p.alt, credit: p.credit };
}

function publicBlock(b: ArticleBlock, ok: (p: ArticlePhoto | null | undefined) => p is ArticlePhoto) {
  if (b.type === "photo") return ok(b.photo) ? { type: b.type, photo: publicPhoto(b.photo) } : null;
  if (b.type === "photo-group") {
    const photos = b.photos.filter(ok);
    return photos.length ? { type: b.type, photos: photos.map(publicPhoto) } : null;
  }
  if (b.type === "brand-card") {
    const photos = (b.photos?.length ? b.photos : [b.photo]).filter(ok);
    // 사진 없는 브랜드는 모음에 넣지 않는다(11-19). 허락이 빠진 카드는 카드째 뺀다.
    if (!photos.length) return null;
    return {
      type: b.type,
      exhibitorId: b.exhibitorId,
      name: b.name,
      ...(b.boothCode ? { boothCode: b.boothCode } : {}),
      ...(b.boothId ? { boothId: b.boothId } : {}),
      ...(b.items ? { items: b.items } : {}),
      ...(b.note ? { note: b.note } : {}),
      photo: publicPhoto(photos[0]),
      photos: photos.map(publicPhoto),
      sourceIds: b.sourceIds,
    };
  }
  return b;
}
