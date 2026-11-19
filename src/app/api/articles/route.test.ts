import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ admin: true }));
vi.mock("@/lib/api/http", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/api/http")>();
  return {
    ...mod,
    requireAdmin: async () => (auth.admin ? null : mod.fail("UNAUTHORIZED", "운영자 인증이 필요해요")),
    getAdminActor: async () => "ted@example.com",
  };
});

import { getRepository } from "@/lib/repositories";
import type { ArticleInput } from "@/lib/types";
import { GET as LIST } from "./route";
import { GET as ONE } from "./[id]/route";
import { POST as DECIDE } from "../admin/articles/[id]/decision/route";
import { POST as SLACK } from "../slack/interactions/route";

const input: ArticleInput = {
  kind: "brand_intro",
  title: "새해 준비상점에서 만나는 하치",
  excerpt: "하치는 새해 준비상점에 참가하는 브랜드예요.",
  body: [{ type: "paragraph", text: "하치는 새해 준비상점에 참가하는 브랜드예요.", sourceIds: ["pt:1"] }],
  sources: [{ id: "pt:1", kind: "participation", label: "참가 사실", origin: ["roam:participant/1", "https://example.org/a"], text: "하치" }],
  gate: { ok: true, writer: "template", issues: [], rejectedAttempts: [], checkedAt: "2026-11-19T00:30:00Z" },
  subjectKey: "brand:ex_hachi",
  exhibitorIds: ["ex_hachi"],
  exhibitionIds: ["exh_ny"],
  generatedFor: "2026-11-19",
};

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const post = (body: unknown) =>
  new Request("http://localhost/x", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });

let id: string;
beforeEach(async () => {
  (globalThis as unknown as { __roamStore?: unknown }).__roamStore = undefined;
  auth.admin = true;
  const repo = await getRepository();
  id = (await repo.createArticle(input))!.id;
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("공개 API — 승인된 것만", () => {
  it("draft는 목록에도 한 편 조회에도 나오지 않는다", async () => {
    expect((await (await LIST(new Request("http://localhost/api/articles"))).json()).data.articles).toEqual([]);
    expect((await ONE(new Request("http://localhost/x"), ctx(id))).status).toBe(404);
  });

  it("승인하면 나오고, 브랜드로 거를 수 있다", async () => {
    expect((await DECIDE(post({ action: "approve" }), ctx(id))).status).toBe(200);
    const list = (await (await LIST(new Request("http://localhost/api/articles?exhibitorId=ex_hachi"))).json()).data.articles;
    expect(list).toHaveLength(1);
    expect(list[0]).not.toHaveProperty("gate");
    expect(list[0].sources[0].origin).toEqual(["https://example.org/a"]);
    expect((await (await LIST(new Request("http://localhost/api/articles?exhibitorId=other"))).json()).data.articles).toEqual([]);
    expect((await ONE(new Request("http://localhost/x"), ctx(id))).status).toBe(200);
  });
});

describe("관리자 결정 API", () => {
  it("운영자가 아니면 401", async () => {
    auth.admin = false;
    expect((await DECIDE(post({ action: "approve" }), ctx(id))).status).toBe(401);
  });
  it("이미 결정된 글은 409, 없는 글은 404, 모르는 결정은 400", async () => {
    expect((await DECIDE(post({ action: "reject", reason: "사진 허락 전" }), ctx(id))).status).toBe(200);
    expect((await DECIDE(post({ action: "approve" }), ctx(id))).status).toBe(409);
    expect((await DECIDE(post({ action: "approve" }), ctx("nope"))).status).toBe(404);
    expect((await DECIDE(post({ action: "publish" }), ctx(id))).status).toBe(400);
    const repo = await getRepository();
    expect(await repo.getArticle(id)).toMatchObject({ status: "rejected", rejectReason: "사진 허락 전", decidedBy: "ted@example.com" });
  });
});

describe("슬랙 인터랙션", () => {
  const SECRET = "slack-signing";
  function slackReq(payload: unknown, opts: { secret?: string; ts?: number } = {}) {
    const body = "payload=" + encodeURIComponent(JSON.stringify(payload));
    const ts = String(opts.ts ?? Math.floor(Date.now() / 1000));
    const sig = "v0=" + createHmac("sha256", opts.secret ?? SECRET).update(`v0:${ts}:${body}`).digest("hex");
    return new Request("http://localhost/api/slack/interactions", {
      method: "POST",
      body,
      headers: { "content-type": "application/x-www-form-urlencoded", "x-slack-request-timestamp": ts, "x-slack-signature": sig },
    });
  }
  const click = (user: string, action = "article_approve") => ({
    type: "block_actions",
    user: { id: user },
    actions: [{ action_id: action, value: id }],
    response_url: "https://hooks.slack.com/actions/T/1/x",
  });

  it("서명 비밀값이 없으면 꺼져 있다(404)", async () => {
    vi.stubEnv("SLACK_SIGNING_SECRET", "");
    expect((await SLACK(slackReq(click("U1")))).status).toBe(404);
  });

  it("서명이 틀리면 401이고 아무것도 바뀌지 않는다", async () => {
    vi.stubEnv("SLACK_SIGNING_SECRET", SECRET);
    vi.stubEnv("SLACK_APPROVER_USER_IDS", "U1");
    expect((await SLACK(slackReq(click("U1"), { secret: "wrong" }))).status).toBe(401);
    expect((await (await getRepository()).getArticle(id))!.status).toBe("draft");
  });

  it("허용된 사람이 아니면 결정하지 않는다", async () => {
    vi.stubEnv("SLACK_SIGNING_SECRET", SECRET);
    vi.stubEnv("SLACK_APPROVER_USER_IDS", "U1");
    const sent: string[] = [];
    vi.stubGlobal("fetch", async (_u: string, init: RequestInit) => (sent.push(String(init.body)), new Response("ok")));
    expect((await SLACK(slackReq(click("U2")))).status).toBe(200);
    expect((await (await getRepository()).getArticle(id))!.status).toBe("draft");
    expect(sent[0]).toContain("결정할 수 있는 사람이 아니에요");
  });

  it("허용된 사람이 누르면 승인되고 슬랙에 알린다", async () => {
    vi.stubEnv("SLACK_SIGNING_SECRET", SECRET);
    vi.stubEnv("SLACK_APPROVER_USER_IDS", "U9, U1");
    const sent: string[] = [];
    vi.stubGlobal("fetch", async (_u: string, init: RequestInit) => (sent.push(String(init.body)), new Response("ok")));
    expect((await SLACK(slackReq(click("U1")))).status).toBe(200);
    expect(await (await getRepository()).getArticle(id)).toMatchObject({ status: "approved", decidedBy: "slack:U1" });
    expect(sent[0]).toContain("승인했어요");
  });
});
