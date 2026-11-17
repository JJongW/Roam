import { beforeEach, describe, expect, it, vi } from "vitest";
import { MockRepository } from "@/lib/mock/repository";
import type { User } from "@/lib/types";

const state = vi.hoisted(() => ({ user: null as User | null }));
vi.mock("@/lib/api/session", () => ({
  getCurrentUser: async () => state.user,
}));

import { PUT } from "./route";

const BOOTH = "b_a1902";

function put(body: unknown) {
  return PUT(
    new Request(`http://localhost/api/me/notes/${BOOTH}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ boothId: BOOTH }) },
  );
}

async function noteOf(res: Response) {
  return (await res.json()).data.note;
}

describe("PUT /api/me/notes/[boothId] — 다녀왔어요, 하트", () => {
  const repo = new MockRepository();
  let userId: string;

  beforeEach(async () => {
    (globalThis as unknown as { __roamStore?: unknown }).__roamStore = undefined;
    const user = await repo.createUser("tester");
    userId = user.id;
    state.user = user;
  });

  it("visited만 보내면 평가 없이 방문이 남고 visit_marked 신호가 쌓인다", async () => {
    const note = await noteOf(await put({ visited: true }));
    expect(note.visited).toBe(true);
    expect(note.visitedAt).toBeTruthy();
    expect(note.verdict).toBeUndefined();
    const kinds = (await repo.listUserSignals(userId)).map((s) => s.kind);
    expect(kinds).toContain("visit_marked");
    expect(kinds.some((k) => k.startsWith("verdict_"))).toBe(false);
  });

  it("평가를 지워도 방문은 남고, 다녀왔어요를 끄면 둘 다 지워진다", async () => {
    await put({ verdict: "good" });
    const cleared = await noteOf(await put({ verdict: null }));
    expect(cleared.verdict).toBeUndefined();
    expect(cleared.visited).toBe(true);

    await put({ verdict: "ok" });
    const off = await noteOf(await put({ visited: false }));
    expect(off.visited).toBe(false);
    expect(off.verdict).toBeUndefined();
    const kinds = (await repo.listUserSignals(userId)).map((s) => s.kind);
    expect(kinds).toContain("visit_unmarked");
  });

  it("heart: true를 받아 heart: true를 돌려주고, 옛 interest도 채운다", async () => {
    const note = await noteOf(await put({ heart: true }));
    expect(note.heart).toBe(true);
    expect(note.heartedAt).toBeTruthy();
    expect(note.interest).toBe("must");
    const kinds = (await repo.listUserSignals(userId)).map((s) => s.kind);
    expect(kinds).toContain("heart_added");
    expect(kinds).not.toContain("reaction_must");
  });

  it("옛 클라이언트가 interest: pass를 보내면 하트가 아니다", async () => {
    await put({ heart: true });
    const note = await noteOf(await put({ interest: "pass" }));
    expect(note.heart).toBe(false);
    expect(note.interest).toBe("pass");
  });

  it("로그인 안 했으면 401", async () => {
    state.user = null;
    expect((await put({ heart: true })).status).toBe(401);
  });
});
