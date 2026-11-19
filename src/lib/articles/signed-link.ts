// 슬랙 메시지 안의 "승인", "반려" 링크 서명. 순수(비밀값은 인자로).
//
// 링크 자체로는 아무것도 바뀌지 않는다. 링크는 관리자 화면(/admin/articles/<id>)을 열 뿐이고,
// 그 화면은 관리자 로그인(ADMIN_EMAILS)을 요구하며, 바꾸는 건 그 화면에서 한 번 더 누르는
// POST다. 서명은 "이 아티클에 이 결정을 하려고 슬랙에서 왔다"는 것과 만료만 증명한다 —
// 위조한 링크로 다른 아티클의 확인 화면을 띄우거나, 오래된 메시지로 결정하는 걸 막는다.
//
// 비밀값: ARTICLE_LINK_SECRET(워커와 Vercel 양쪽에 같은 값). 세션 쿠키 키와 나눈 이유는
// 워커 .env가 운영 SESSION_SECRET과 같다는 보장이 없고, 링크 키를 돌려도 로그인이 풀리지 않게 하려는 것.
import { createHmac, timingSafeEqual } from "node:crypto";

export const ARTICLE_ACTIONS = ["approve", "reject"] as const;
export type ArticleAction = (typeof ARTICLE_ACTIONS)[number];

/** 링크 유효 기간. 슬랙 보고는 매일 오지만 주말을 넘겨 볼 수 있게. */
export const LINK_TTL_MS = 7 * 86_400_000;

function payload(id: string, action: ArticleAction, exp: number): string {
  return `article-action:v1:${id}:${action}:${exp}`;
}

export function signArticleAction(secret: string, id: string, action: ArticleAction, exp: number): string {
  return createHmac("sha256", secret).update(payload(id, action, exp)).digest("base64url");
}

export type VerifyResult = { ok: true } | { ok: false; reason: "no-secret" | "malformed" | "expired" | "bad-signature" };

export function verifyArticleAction(
  secret: string | undefined,
  q: { id: string; action: string | null | undefined; exp: string | null | undefined; sig: string | null | undefined },
  now = Date.now(),
): VerifyResult {
  if (!secret) return { ok: false, reason: "no-secret" };
  if (!q.action || !(ARTICLE_ACTIONS as readonly string[]).includes(q.action) || !q.exp || !q.sig || !/^\d+$/.test(q.exp))
    return { ok: false, reason: "malformed" };
  const exp = Number(q.exp);
  const expected = Buffer.from(signArticleAction(secret, q.id, q.action as ArticleAction, exp));
  const got = Buffer.from(q.sig);
  // 만료보다 서명을 먼저 본다 — 만료 여부가 서명 없는 요청에 정보를 주지 않게.
  if (expected.length !== got.length || !timingSafeEqual(expected, got)) return { ok: false, reason: "bad-signature" };
  if (now > exp) return { ok: false, reason: "expired" };
  return { ok: true };
}

/** 관리자 미리보기 주소. 서명이 없으면(secret 없음) 결정 쿼리 없이 미리보기만. */
export function articleAdminUrl(base: string, id: string, opts?: { secret?: string; action?: ArticleAction; now?: number }): string {
  const root = `${base.replace(/\/+$/, "")}/admin/articles/${encodeURIComponent(id)}`;
  if (!opts?.secret || !opts.action) return root;
  const exp = (opts.now ?? Date.now()) + LINK_TTL_MS;
  const sig = signArticleAction(opts.secret, id, opts.action, exp);
  return `${root}?action=${opts.action}&exp=${exp}&sig=${sig}`;
}
