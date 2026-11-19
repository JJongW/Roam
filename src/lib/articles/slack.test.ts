import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { formatBacklog, type Backlog } from "@/lib/admin/backlog";
import { composeDailyReport, formatArticleSection, parseApprovers, slackPayload, verifySlackSignature } from "./slack";
import { verifyArticleAction } from "./signed-link";

const zero = { count: 0, oldestDays: 0, atLeast: false };
const empty: Backlog = { staleDays: 3, drafts: zero, brands: zero, stuckJobs: zero, failedJobs: zero, pending: { drafts: 0, brands: 0, queued: 0 } };
const busy: Backlog = { ...empty, drafts: { count: 4, oldestDays: 9, atLeast: false } };

const draft = {
  id: "art_1",
  kind: "brand_intro" as const,
  title: "새해 준비상점에서 만나는 하치",
  excerpt: "하치는 새해 준비상점에 참가하는 브랜드예요. 새해 준비상점은 2026년 12월 4일부터 12월 6일까지 킨텍스 제2전시장 6홀에서 열려요.",
  sources: [{}, {}, {}] as never[],
  generatedFor: "2026-11-19",
};
const APP = "https://roam.example/";
const SECRET = "link-secret";
const NOW = Date.parse("2026-11-19T00:30:00Z");

describe("매일 보고 — 적체 아래 아티클 칸", () => {
  it("적체가 없어도 승인 대기 초안이 있으면 보낸다", () => {
    const text = composeDailyReport(formatBacklog(empty, APP), formatArticleSection({ drafts: [draft] }, { appUrl: APP, linkSecret: SECRET, now: NOW }));
    expect(text).not.toBeNull();
    expect(text).not.toContain("검수 대기 초안");
    expect(text).toContain("*아티클 초안* (승인 대기 1편)");
    expect(text).toContain("*새해 준비상점에서 만나는 하치*");
    expect(text).toContain("> 하치는 새해 준비상점에 참가하는 브랜드예요.");
    expect(text).toContain("출처 3개");
    expect(text).toContain("<https://roam.example/admin/articles/art_1|미리보기>");
    expect(text).toMatch(/\|승인>/);
    expect(text).toMatch(/\|반려>/);
    expect(text).not.toContain("·");
  });

  it("적체가 있으면 적체가 위, 아티클이 아래", () => {
    const text = composeDailyReport(formatBacklog(busy, APP), formatArticleSection({ drafts: [draft] }, { appUrl: APP }))!;
    expect(text.indexOf("Roam 검수 적체")).toBeGreaterThanOrEqual(0);
    expect(text.indexOf("Roam 검수 적체")).toBeLessThan(text.indexOf("아티클 초안"));
  });

  it("적체도 초안도 없으면 보내지 않는다", () => {
    expect(composeDailyReport(formatBacklog(empty, APP), formatArticleSection({ drafts: [] }, { appUrl: APP }))).toBeNull();
  });

  it("초안이 없어도 실패 알림은 한 줄 나간다", () => {
    const s = formatArticleSection({ drafts: [], note: "아티클 초안 만들기가 실패했어요: x" }, { appUrl: APP })!;
    expect(s).toContain("승인 대기 0편");
    expect(s).toContain("실패했어요");
  });

  it("링크 비밀값이 없으면 승인 링크 없이 미리보기만", () => {
    const s = formatArticleSection({ drafts: [draft] }, { appUrl: APP })!;
    expect(s).toContain("|미리보기>");
    expect(s).not.toContain("|승인>");
  });

  it("승인 링크는 서명돼 있고 검증된다", () => {
    const s = formatArticleSection({ drafts: [draft] }, { appUrl: APP, linkSecret: SECRET, now: NOW })!;
    const url = new URL(s.match(/<([^|>]+)\|승인>/)![1]);
    expect(url.pathname).toBe("/admin/articles/art_1");
    const q = { id: "art_1", action: url.searchParams.get("action"), exp: url.searchParams.get("exp"), sig: url.searchParams.get("sig") };
    expect(q.action).toBe("approve");
    expect(verifyArticleAction(SECRET, q, NOW)).toEqual({ ok: true });
  });

  it("이전 초안이 더 있으면 수를 알린다", () => {
    const s = formatArticleSection({ drafts: [draft, { ...draft, id: "art_0" }] }, { appUrl: APP })!;
    expect(s).toContain("이전 초안 1편도 기다리고 있어요");
  });

  it("제목의 <, >, &는 슬랙 문법과 섞이지 않게 이스케이프한다", () => {
    const s = formatArticleSection({ drafts: [{ ...draft, title: "A&B <x>" }] }, { appUrl: APP })!;
    expect(s).toContain("A&amp;B &lt;x&gt;");
  });

  it("버튼은 켰을 때만 블록으로 붙는다", () => {
    expect(slackPayload("t")).toEqual({ text: "t" });
    const p = slackPayload("t", { buttonsFor: { id: "art_1" } }) as { blocks: { type: string; elements?: { value: string; action_id: string }[] }[] };
    const actions = p.blocks.find((b) => b.type === "actions")!;
    expect(actions.elements!.map((e) => [e.action_id, e.value])).toEqual([
      ["article_approve", "art_1"],
      ["article_reject", "art_1"],
    ]);
  });
});

describe("서명 링크", () => {
  const sign = () => {
    const s = formatArticleSection({ drafts: [draft] }, { appUrl: APP, linkSecret: SECRET, now: NOW })!;
    const url = new URL(s.match(/<([^|>]+)\|반려>/)![1]);
    return { id: "art_1", action: url.searchParams.get("action"), exp: url.searchParams.get("exp"), sig: url.searchParams.get("sig") };
  };
  it("다른 아티클이나 다른 결정으로 바꾸면 서명이 맞지 않는다", () => {
    const q = sign();
    expect(verifyArticleAction(SECRET, { ...q, id: "art_2" }, NOW)).toEqual({ ok: false, reason: "bad-signature" });
    expect(verifyArticleAction(SECRET, { ...q, action: "approve" }, NOW)).toEqual({ ok: false, reason: "bad-signature" });
    expect(verifyArticleAction("other", q, NOW)).toEqual({ ok: false, reason: "bad-signature" });
  });
  it("7일이 지나면 만료", () => {
    expect(verifyArticleAction(SECRET, sign(), NOW + 8 * 86_400_000)).toEqual({ ok: false, reason: "expired" });
  });
  it("비밀값이 없거나 모양이 틀리면 거절", () => {
    expect(verifyArticleAction(undefined, sign(), NOW)).toEqual({ ok: false, reason: "no-secret" });
    expect(verifyArticleAction(SECRET, { ...sign(), action: "publish" }, NOW)).toEqual({ ok: false, reason: "malformed" });
    expect(verifyArticleAction(SECRET, { ...sign(), sig: null }, NOW)).toEqual({ ok: false, reason: "malformed" });
  });
});

describe("슬랙 인터랙션 서명(v0)", () => {
  const secret = "slack-signing";
  const body = "payload=%7B%7D";
  const ts = "1795000000";
  const sig = "v0=" + createHmac("sha256", secret).update(`v0:${ts}:${body}`).digest("hex");

  it("맞는 서명은 통과", () => {
    expect(verifySlackSignature({ secret, timestamp: ts, signature: sig, rawBody: body, nowSec: 1795000010 })).toEqual({ ok: true });
  });
  it("본문이 바뀌면 거절", () => {
    expect(verifySlackSignature({ secret, timestamp: ts, signature: sig, rawBody: body + "x", nowSec: 1795000010 })).toEqual({ ok: false, reason: "bad-signature" });
  });
  it("5분이 넘은 요청은 거절(재전송)", () => {
    expect(verifySlackSignature({ secret, timestamp: ts, signature: sig, rawBody: body, nowSec: 1795000000 + 301 })).toEqual({ ok: false, reason: "stale" });
  });
  it("비밀값이나 헤더가 없으면 거절", () => {
    expect(verifySlackSignature({ secret: undefined, timestamp: ts, signature: sig, rawBody: body })).toEqual({ ok: false, reason: "no-secret" });
    expect(verifySlackSignature({ secret, timestamp: null, signature: sig, rawBody: body })).toEqual({ ok: false, reason: "missing" });
  });
  it("결정할 수 있는 사람 목록", () => {
    expect(parseApprovers(" U1, ,U2 ")).toEqual(["U1", "U2"]);
    expect(parseApprovers(undefined)).toEqual([]);
  });
});
