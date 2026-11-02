import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { handleWebhook, type HandleDeps, type IgWebhookPayload } from "./handle";
import { matchRule, normalizeForMatch, type DmRule } from "./rules";
import { verifyMetaSignature } from "./signature";

const RULES: DmRule[] = [
  { id: "map", keywords: ["지도"], message: "링크", publicReply: "DM 보냈어요" },
  { id: "only-post", keywords: ["테마"], mediaIds: ["m2"], message: "테마 링크" },
];

const payload = (...comments: Array<{ id: string; text: string; from?: string; media?: string }>): IgWebhookPayload => ({
  object: "instagram",
  entry: [
    {
      id: "me",
      changes: comments.map((c) => ({
        field: "comments",
        value: { id: c.id, text: c.text, from: { id: c.from ?? "u1", username: "u" }, media: { id: c.media ?? "m1" } },
      })),
    },
  ],
});

function deps(over: Partial<HandleDeps> = {}) {
  const claimed = new Set<string>();
  return {
    igUserId: "me",
    rules: RULES,
    claim: vi.fn(async (c: { commentId: string }) => (claimed.has(c.commentId) ? false : (claimed.add(c.commentId), true))),
    sendPrivateReply: vi.fn(async () => {}),
    replyToComment: vi.fn(async () => {}),
    markResult: vi.fn(async () => {}),
    ...over,
  } satisfies HandleDeps;
}

describe("matchRule", () => {
  it("공백·문장부호를 무시하고 부분 일치한다", () => {
    expect(normalizeForMatch(" 지 도! ")).toBe("지도");
    expect(matchRule("지도 주세요🙏", "m1", RULES)?.id).toBe("map");
    expect(matchRule("감사합니다", "m1", RULES)).toBeNull();
  });
  it("mediaIds가 있으면 그 게시물에서만 반응한다", () => {
    expect(matchRule("테마", "m1", RULES)).toBeNull();
    expect(matchRule("테마", "m2", RULES)?.id).toBe("only-post");
  });
});

describe("verifyMetaSignature", () => {
  const body = '{"object":"instagram"}';
  const sig = "sha256=" + createHmac("sha256", "secret").update(body).digest("hex");
  it("맞는 서명만 통과시킨다", () => {
    expect(verifyMetaSignature(body, sig, "secret")).toBe(true);
    expect(verifyMetaSignature(body, sig, "other")).toBe(false);
    expect(verifyMetaSignature(body + " ", sig, "secret")).toBe(false);
    expect(verifyMetaSignature(body, null, "secret")).toBe(false);
    expect(verifyMetaSignature(body, "sha256=zz", "secret")).toBe(false);
  });
});

describe("handleWebhook", () => {
  it("키워드 댓글에 DM과 공개 답글을 보낸다", async () => {
    const d = deps();
    const out = await handleWebhook(payload({ id: "c1", text: "지도요" }), d);
    expect(out).toEqual([{ commentId: "c1", result: "sent", ruleId: "map", publicReplyError: undefined }]);
    expect(d.sendPrivateReply).toHaveBeenCalledWith("c1", "링크");
    expect(d.replyToComment).toHaveBeenCalledWith("c1", "DM 보냈어요");
    expect(d.markResult).toHaveBeenCalledWith("c1", "sent");
  });

  it("내 계정 댓글과 키워드 없는 댓글은 건너뛴다", async () => {
    const d = deps();
    const out = await handleWebhook(payload({ id: "c1", text: "지도", from: "me" }, { id: "c2", text: "예뻐요" }), d);
    expect(out.map((o) => o.result === "skipped" && o.reason)).toEqual(["own", "no-match"]);
    expect(d.sendPrivateReply).not.toHaveBeenCalled();
  });

  it("같은 댓글이 다시 오면 DM을 두 번 보내지 않는다", async () => {
    const d = deps();
    await handleWebhook(payload({ id: "c1", text: "지도" }), d);
    const again = await handleWebhook(payload({ id: "c1", text: "지도" }), d);
    expect(again[0]).toMatchObject({ result: "skipped", reason: "duplicate" });
    expect(d.sendPrivateReply).toHaveBeenCalledTimes(1);
  });

  it("DM이 실패하면 failed로 남기고 공개 답글은 달지 않는다", async () => {
    const d = deps({ sendPrivateReply: vi.fn(async () => { throw new Error("7일 지남"); }) });
    const out = await handleWebhook(payload({ id: "c1", text: "지도" }), d);
    expect(out[0]).toMatchObject({ result: "failed", error: "7일 지남" });
    expect(d.markResult).toHaveBeenCalledWith("c1", "failed", "7일 지남");
    expect(d.replyToComment).not.toHaveBeenCalled();
  });

  it("공개 답글이 실패해도 DM은 sent로 둔다", async () => {
    const d = deps({ replyToComment: vi.fn(async () => { throw new Error("rate"); }) });
    const out = await handleWebhook(payload({ id: "c1", text: "지도" }), d);
    expect(out[0]).toMatchObject({ result: "sent", publicReplyError: "rate" });
  });

  it("comments가 아닌 필드는 무시한다", async () => {
    const d = deps();
    const out = await handleWebhook({ entry: [{ id: "me", changes: [{ field: "mentions", value: { id: "x", text: "지도" } }] }] }, d);
    expect(out).toEqual([]);
  });
});
