import { beforeEach, describe, expect, it, vi } from "vitest";
import { MockRepository } from "@/lib/mock/repository";
import { readBrain, setValueMuted } from "@/lib/memory/service";
import type { User } from "@/lib/types";

// getCurrentUser만 갈아끼운다 — 쿠키·Next 런타임 없이 핸들러 본문을 그대로 태우려고.
const state = vi.hoisted(() => ({ user: null as User | null }));
vi.mock("@/lib/api/session", () => ({
  getCurrentUser: async () => state.user,
}));

import { POST } from "./route";

function req(body: unknown) {
  return new Request("http://localhost/api/me/values", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/me/values", () => {
  const repo = new MockRepository();
  let userId: string;

  beforeEach(async () => {
    (globalThis as unknown as { __roamStore?: unknown }).__roamStore =
      undefined;
    const user = await repo.createUser("tester");
    userId = user.id;
    state.user = user;
  });

  it("로그인 안 했으면 401 — 기존 동작 유지", async () => {
    state.user = null;
    const res = await POST(req({ values: ["goods"] }));
    expect(res.status).toBe(401);
  });

  it("8가치 밖의 값만 보내면 400 — 기존 동작 유지", async () => {
    const res = await POST(req({ values: ["nonsense"] }));
    expect(res.status).toBe(400);
  });

  it("본문이 스키마에 안 맞으면 400 — 기존 동작 유지", async () => {
    const res = await POST(req({ values: [] }));
    expect(res.status).toBe(400);
  });

  it("고른 가치를 관심으로 시드한다", async () => {
    const res = await POST(req({ values: ["goods"] }));
    expect(res.status).toBe(204);
    const brain = await readBrain(userId);
    expect(brain.interests.find((n) => n.key === "goods")).toBeDefined();
  });

  it("예전에 끈 가치를 다시 고르면 뮤트가 풀리고 관심으로 돌아온다", async () => {
    // 뮤트를 안 풀면 재증류가 방금 남긴 신호를 도로 걸러내서 아무 일도 안 일어난다.
    await setValueMuted(userId, "goods", true);
    expect((await readBrain(userId)).mutedSlugs).toContain("goods");

    const res = await POST(req({ values: ["goods"] }));
    expect(res.status).toBe(204);

    const brain = await readBrain(userId);
    expect(brain.mutedSlugs).not.toContain("goods");
    expect(brain.interests.find((n) => n.key === "goods")).toBeDefined();
  });

  it("고르지 않은 가치의 뮤트는 그대로 둔다 — 한 번 고른다고 전부 되살아나면 안 된다", async () => {
    await setValueMuted(userId, "goods", true);
    await setValueMuted(userId, "trend", true);

    await POST(req({ values: ["goods"] }));

    expect((await readBrain(userId)).mutedSlugs).toEqual(["trend"]);
  });
});
