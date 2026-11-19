// 매일 슬랙 보고의 아티클 칸, 보고 합치기, 슬랙 인터랙션 서명 검사. 순수(비밀값과 시각은 인자로).
//
// 들어오는 웹훅(SLACK_WEBHOOK_URL)은 버튼 클릭을 받을 수 없다. 그래서 두 길을 같이 둔다.
// (a) 메시지 안 서명 링크 "승인", "반려" → 관리자 화면 → 로그인 → 한 번 더 눌러 확정. 늘 켜져 있다.
// (b) 슬랙 앱 버튼 → POST /api/slack/interactions(SLACK_SIGNING_SECRET로 서명 검사). 앱을 설정했을 때만.
import { createHmac, timingSafeEqual } from "node:crypto";
import type { Article } from "@/lib/types";
import { articleAdminUrl } from "./signed-link";
import { koreanDay } from "./schedule";

/** 슬랙 mrkdwn 이스케이프(&, <, >). 링크 문법과 섞이지 않게. */
export function slackEscape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export interface ArticleReportInput {
  /** 승인을 기다리는 초안. 최신 것 먼저. 첫 편을 크게 보여 준다. */
  drafts: Pick<Article, "id" | "title" | "excerpt" | "sources" | "kind" | "generatedFor" | "hero">[];
  /** 이번 주 생성이 실패했거나 고를 주제가 없었을 때 한 줄. */
  note?: string | null;
  /**
   * 다음 자동 초안을 만드는 날(KST YYYY-MM-DD, 월요일). 승인 대기 초안이 있을 때만 한 줄로 붙인다.
   * 기다리는 초안이 없는 날엔 아티클 칸 자체가 없다(초안이 없는 요일마다 알리면 소음이다).
   */
  nextDraftOn?: string | null;
}

export interface ReportLinks {
  appUrl: string;
  /** ARTICLE_LINK_SECRET. 없으면 승인 링크 없이 미리보기만. */
  linkSecret?: string;
  now?: number;
}

export const KIND_LABEL: Record<Article["kind"], string> = {
  brand_intro: "브랜드 소개",
  fair_roundup: "박람회 참가 브랜드 모음",
};

/** 사진 경로("/…" 또는 https)를 슬랙이 열 수 있는 절대 주소로. 그 밖의 경로는 null. */
export function photoUrl(path: string | undefined | null, appUrl: string): string | null {
  if (!path) return null;
  if (/^https:\/\//.test(path)) return path;
  if (/^\/(?!\/)/.test(path)) return appUrl.replace(/\/+$/, "") + encodeURI(path);
  return null;
}

/** 미리보기 두세 줄. 슬랙 인용(>)으로. */
function excerptLines(excerpt: string): string[] {
  const parts = excerpt
    .split(/(?<=[.!?])\s+/)
    .map((x) => x.trim())
    .filter(Boolean);
  const lines: string[] = [];
  for (const p of parts) {
    if (lines.length === 3) break;
    lines.push(p);
  }
  return lines.map((l) => `> ${slackEscape(l)}`);
}

/** 아티클 칸(mrkdwn). 초안도 알릴 것도 없으면 null. */
export function formatArticleSection(input: ArticleReportInput, links: ReportLinks): string | null {
  const [top, ...rest] = input.drafts;
  if (!top && !input.note) return null;
  const app = links.appUrl.replace(/\/+$/, "");
  const lines: string[] = [`*아티클 초안* (승인 대기 ${input.drafts.length}편)`];
  if (top) {
    const preview = articleAdminUrl(app, top.id);
    lines.push(`*${slackEscape(top.title)}*  _${KIND_LABEL[top.kind]}, ${top.generatedFor}_`);
    lines.push(...excerptLines(top.excerpt));
    const hero = photoUrl(top.hero?.path, app);
    lines.push(hero ? `대표 사진 <${hero}|열기> (${slackEscape(top.hero.credit)})  |  출처 ${top.sources.length}개` : `출처 ${top.sources.length}개`);
    const actions = [`<${preview}|미리보기>`];
    if (links.linkSecret) {
      const opts = { secret: links.linkSecret, now: links.now };
      actions.push(`<${articleAdminUrl(app, top.id, { ...opts, action: "approve" })}|승인>`);
      actions.push(`<${articleAdminUrl(app, top.id, { ...opts, action: "reject" })}|반려>`);
    }
    lines.push(actions.join("  |  "));
  }
  if (rest.length) lines.push(`이전 초안 ${rest.length}편도 기다리고 있어요. <${app}/admin/articles|목록 열기>`);
  if (input.note) lines.push(slackEscape(input.note));
  else if (top && input.nextDraftOn) lines.push(`다음 초안은 ${koreanDay(input.nextDraftOn)}에 만들어요.`);
  return lines.join("\n");
}

/** 적체 보고와 아티클 칸을 합친다. 둘 다 없으면 null(조용한 날엔 보내지 않는다). */
export function composeDailyReport(backlog: string | null, article: string | null): string | null {
  const parts = [backlog, article].filter((x): x is string => !!x);
  return parts.length ? parts.join("\n\n") : null;
}

export const SLACK_ACTION = { approve: "article_approve", reject: "article_reject" } as const;

/**
 * 웹훅 본문. `buttons`면 Block Kit 버튼을 붙인다 — 그 웹훅이 인터랙티브를 켠 슬랙 앱에 속해
 * 있어야 눌린다(아니면 버튼이 오류를 낸다). text는 알림과 버튼 없는 클라이언트용으로 늘 같이 간다.
 */
export function slackPayload(
  text: string,
  opts: { buttonsFor?: Pick<Article, "id"> | null; image?: { url: string; alt: string } | null } = {},
): Record<string, unknown> {
  const image = opts.image && /^https:\/\//.test(opts.image.url) ? opts.image : null;
  if (!opts.buttonsFor && !image) return { text };
  const blocks: Record<string, unknown>[] = [
    // 섹션 글은 3000자 상한.
    { type: "section", text: { type: "mrkdwn", text: text.slice(0, 2900) } },
  ];
  // 대표 사진. 슬랙이 주소를 내려받지 못하면 메시지 전체가 거절된다 — 보내는 쪽(sweep)이 글만으로 다시 보낸다.
  if (image) blocks.push({ type: "image", image_url: image.url, alt_text: image.alt.slice(0, 1900) });
  if (opts.buttonsFor) {
    const id = opts.buttonsFor.id;
    blocks.push({
      type: "actions",
      block_id: `article:${id}`,
      elements: [
        { type: "button", action_id: SLACK_ACTION.approve, text: { type: "plain_text", text: "승인" }, style: "primary", value: id },
        { type: "button", action_id: SLACK_ACTION.reject, text: { type: "plain_text", text: "반려" }, style: "danger", value: id },
      ],
    });
  }
  return { text, blocks };
}

/** 첫 초안의 대표 사진을 슬랙 이미지 블록 재료로. */
export function heroImage(draft: Pick<Article, "hero"> | undefined, appUrl: string): { url: string; alt: string } | null {
  const url = photoUrl(draft?.hero?.path, appUrl);
  return url && draft?.hero ? { url, alt: draft.hero.alt } : null;
}

/** 슬랙 서명 검사(v0). https://api.slack.com/authentication/verifying-requests-from-slack */
export const SLACK_MAX_SKEW_S = 60 * 5;

export function verifySlackSignature(input: {
  secret: string | undefined;
  timestamp: string | null;
  signature: string | null;
  rawBody: string;
  nowSec?: number;
}): { ok: true } | { ok: false; reason: "no-secret" | "missing" | "stale" | "bad-signature" } {
  if (!input.secret) return { ok: false, reason: "no-secret" };
  if (!input.timestamp || !input.signature || !/^\d+$/.test(input.timestamp)) return { ok: false, reason: "missing" };
  const now = input.nowSec ?? Math.floor(Date.now() / 1000);
  // 재전송 공격 막기: 5분이 넘은 요청은 서명이 맞아도 버린다.
  if (Math.abs(now - Number(input.timestamp)) > SLACK_MAX_SKEW_S) return { ok: false, reason: "stale" };
  const expected = Buffer.from(
    "v0=" + createHmac("sha256", input.secret).update(`v0:${input.timestamp}:${input.rawBody}`).digest("hex"),
  );
  const got = Buffer.from(input.signature);
  if (expected.length !== got.length || !timingSafeEqual(expected, got)) return { ok: false, reason: "bad-signature" };
  return { ok: true };
}

/** 쉼표 구분 슬랙 사용자 id 목록. 비면 아무도 버튼으로 결정할 수 없다. */
export function parseApprovers(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}
