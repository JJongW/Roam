import { beforeEach, describe, expect, it, vi } from "vitest";
import { MockRepository } from "@/lib/mock/repository";
import type { ExhibitorGraph, User } from "@/lib/types";

const state = vi.hoisted(() => ({ user: null as User | null, cleared: 0, authDeleted: [] as string[][] }));
vi.mock("@/lib/api/session", () => ({ getCurrentUser: async () => state.user }));
vi.mock("@/lib/api/http", async (orig) => ({
  ...(await orig<typeof import("@/lib/api/http")>()),
  getBearerUserId: async () => "9b2c1f0e-1111-4c55-9a51-3a3f4a0f9d11",
  clearUserCookie: async () => {
    state.cleared++;
  },
}));
vi.mock("@/lib/auth/delete-auth-users", () => ({
  deleteAuthUsers: async (ids: string[]) => {
    state.authDeleted.push(ids);
    return [];
  },
}));

import { DELETE } from "./route";

describe("DELETE /api/me — 본인 계정 바로 지우기", () => {
  const repo = new MockRepository();

  beforeEach(async () => {
    (globalThis as unknown as { __roamStore?: unknown }).__roamStore = undefined;
    state.user = await repo.createUser("leaver");
    state.cleared = 0;
    state.authDeleted = [];
  });

  it("노트, 브랜드 하트, 기기 토큰, 계정을 지우고 auth 사용자 삭제를 부르고 쿠키를 지운다", async () => {
    const id = state.user!.id;
    const other = await repo.createUser("stayer");
    await repo.upsertNote(id, "b_a1902", { heart: true, visited: true, memo: "메모" }, undefined);
    await repo.upsertNote(other.id, "b_a1902", { heart: true }, undefined);
    const g = (globalThis as unknown as { __roamStore: { exhibitorGraph: ExhibitorGraph } }).__roamStore.exhibitorGraph;
    g.exhibitors.push({ id: "ex1", canonicalName: "브랜드" });
    await repo.addBrandHeart(id, "ex1");
    await repo.upsertPushDevice({ token: "f".repeat(64), environment: "production", userId: id });
    await repo.recordAppEvents([
      { eventId: "e1", name: "app_open", clientTs: "2026-11-17T00:00:00Z", platform: "ios", anonId: "a", userId: id, exhibitionId: null, boothId: null, props: {} },
    ]);

    const res = await DELETE();
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({ deleted: true, authUserDeleted: true });

    expect(await repo.getUser(id)).toBeNull();
    expect(await repo.listNotes(id)).toEqual([]);
    expect(await repo.listBrandHearts(id)).toEqual([]);
    const st = (globalThis as unknown as { __roamStore: { pushDevices: unknown[]; analytics: { userId?: string | null }[] } }).__roamStore;
    expect(st.pushDevices).toHaveLength(0);
    expect(st.analytics.every((a) => a.userId !== id)).toBe(true);
    // 다른 사람 것은 그대로
    expect(await repo.listNotes(other.id)).toHaveLength(1);
    expect(state.authDeleted).toEqual([["9b2c1f0e-1111-4c55-9a51-3a3f4a0f9d11"]]);
    expect(state.cleared).toBe(1);
  });

  it("로그인 안 했으면 401이고 아무것도 지우지 않는다", async () => {
    state.user = null;
    expect((await DELETE()).status).toBe(401);
    expect(state.authDeleted).toHaveLength(0);
  });
});
