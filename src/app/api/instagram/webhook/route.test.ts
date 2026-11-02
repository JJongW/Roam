import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const SECRET = "test-app-secret";

const mocks = vi.hoisted(() => ({
  sendPrivateReply: vi.fn(async () => {}),
  replyToComment: vi.fn(async () => {}),
  claim: vi.fn(async () => true),
  markResult: vi.fn(async () => {}),
}));

vi.mock("@/lib/env", () => ({
  env: {
    IG_APP_SECRET: "test-app-secret",
    IG_WEBHOOK_VERIFY_TOKEN: "verify-me",
    IG_ACCESS_TOKEN: "token",
    IG_USER_ID: "ig_self",
  },
  hasInstagramDm: true,
}));
vi.mock("@/lib/instagram/graph", () => ({
  sendPrivateReply: mocks.sendPrivateReply,
  replyToComment: mocks.replyToComment,
}));
vi.mock("@/lib/instagram/store", () => ({
  createDmStore: () => ({ claim: mocks.claim, markResult: mocks.markResult }),
}));

import { GET, POST } from "./route";

const URL_BASE = "https://roam.test/api/instagram/webhook";

function sign(body: string) {
  return `sha256=${createHmac("sha256", SECRET).update(body, "utf8").digest("hex")}`;
}

function post(body: string, signature: string | null) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (signature) headers["x-hub-signature-256"] = signature;
  return new Request(URL_BASE, { method: "POST", body, headers });
}

const payload = JSON.stringify({
  object: "instagram",
  entry: [
    {
      id: "ig_self",
      changes: [
        {
          field: "comments",
          value: { id: "c1", text: "지도 주세요", from: { id: "u1", username: "visitor" }, media: { id: "m1" } },
        },
      ],
    },
  ],
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
});

describe("GET 웹훅 확인", () => {
  it("verify token이 맞으면 challenge를 돌려준다", async () => {
    const res = await GET(
      new Request(`${URL_BASE}?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=abc123`),
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("abc123");
  });

  it("토큰이 틀리면 403", async () => {
    const res = await GET(
      new Request(`${URL_BASE}?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=abc123`),
    );
    expect(res.status).toBe(403);
  });
});

describe("POST 댓글 이벤트", () => {
  it("서명이 틀리면 401이고 DM을 보내지 않는다", async () => {
    const res = await POST(post(payload, "sha256=deadbeef"));
    expect(res.status).toBe(401);
    expect(mocks.sendPrivateReply).not.toHaveBeenCalled();
  });

  it("서명이 없으면 401", async () => {
    const res = await POST(post(payload, null));
    expect(res.status).toBe(401);
  });

  it("서명이 맞으면 200 EVENT_RECEIVED이고 DM을 한 번 보낸다", async () => {
    const res = await POST(post(payload, sign(payload)));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("EVENT_RECEIVED");
    expect(mocks.sendPrivateReply).toHaveBeenCalledTimes(1);
    expect(mocks.sendPrivateReply).toHaveBeenCalledWith("c1", expect.any(String));
  });

  it("JSON이 깨지면 400", async () => {
    const bad = "{not json";
    const res = await POST(post(bad, sign(bad)));
    expect(res.status).toBe(400);
  });

  it("선점 단계가 throw하면 500(Meta 재전송 유도)", async () => {
    mocks.claim.mockRejectedValueOnce(new Error("db down"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await POST(post(payload, sign(payload)));
    expect(res.status).toBe(500);
    expect(mocks.sendPrivateReply).not.toHaveBeenCalled();
  });
});
