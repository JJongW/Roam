import { beforeEach, describe, expect, it, vi } from "vitest";
import { MockRepository } from "@/lib/mock/repository";
import type { PushDevice, User } from "@/lib/types";

const state = vi.hoisted(() => ({ user: null as User | null }));
vi.mock("@/lib/api/session", () => ({
  getCurrentUser: async () => state.user,
  ensureSession: async () => ({ id: "s_web" }),
}));

import { DELETE, POST } from "./route";

const TOKEN = "a".repeat(64);
const ANON = "0b7f2a7e-3c1d-4c55-9a51-3a3f4a0f9d11";
const devices = () =>
  (globalThis as unknown as { __roamStore: { pushDevices: PushDevice[] } }).__roamStore.pushDevices;
const post = (body: unknown) =>
  POST(new Request("http://localhost/api/push/subscribe", { method: "POST", body: JSON.stringify(body) }));

describe("/api/push/subscribe", () => {
  const repo = new MockRepository();
  beforeEach(() => {
    (globalThis as unknown as { __roamStore?: unknown }).__roamStore = undefined;
    state.user = null;
  });

  it("로그인 안 한 기기는 anonId로 저장하고 계정엔 안 묶는다", async () => {
    const res = await post({ platform: "ios", token: TOKEN, environment: "sandbox", anonId: ANON });
    expect(res.status).toBe(201);
    expect((await res.json()).data.device.linkedToAccount).toBe(false);
    expect(devices()[0]).toMatchObject({ token: TOKEN, userId: null, anonId: ANON });
  });

  it("로그인하면 같은 토큰 한 줄이 계정에 묶인다", async () => {
    await post({ platform: "ios", token: TOKEN, environment: "production", anonId: ANON });
    state.user = await repo.createUser("pushy");
    await post({ platform: "ios", token: TOKEN, environment: "production", anonId: ANON });
    expect(devices()).toHaveLength(1);
    expect(devices()[0].userId).toBe(state.user.id);
  });

  it("로그인도 anonId도 없으면 400, 웹 옛 모양은 저장 없이 201", async () => {
    expect((await post({ platform: "ios", token: TOKEN, environment: "sandbox" })).status).toBe(400);
    expect((await post({ token: "web_tok_1" })).status).toBe(201);
    await repo.listExhibitions(); // 스토어 초기화
    expect(devices()).toHaveLength(0);
  });

  it("DELETE는 토큰을 끊는다", async () => {
    await post({ platform: "ios", token: TOKEN, environment: "sandbox", anonId: ANON });
    const res = await DELETE(new Request("http://localhost", { method: "DELETE", body: JSON.stringify({ token: TOKEN }) }));
    expect(res.status).toBe(204);
    expect(devices()[0].revokedAt).toBeTruthy();
  });
});
