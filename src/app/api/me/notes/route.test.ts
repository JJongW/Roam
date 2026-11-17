import { beforeEach, describe, expect, it, vi } from "vitest";
import { MockRepository } from "@/lib/mock/repository";
import type { ExhibitorGraph, User } from "@/lib/types";

const state = vi.hoisted(() => ({ user: null as User | null }));
vi.mock("@/lib/api/session", () => ({ getCurrentUser: async () => state.user }));

import { GET } from "./route";

describe("GET /api/me/notes", () => {
  const repo = new MockRepository();
  beforeEach(async () => {
    (globalThis as unknown as { __roamStore?: unknown }).__roamStore = undefined;
    state.user = await repo.createUser("reader");
    await repo.upsertNote(state.user.id, "b_a1902", { heart: true, visited: true }, undefined);
  });

  it("기본은 옛 모양 그대로", async () => {
    const { data } = await (await GET(new Request("http://localhost/api/me/notes"))).json();
    expect(data.data[0].boothId).toBe("b_a1902");
    expect(data.data[0].booth).toBeUndefined();
  });

  it("expand=booth면 부스, 박람회, 대표 브랜드를 붙인다", async () => {
    const booth = await repo.getBooth("b_a1902");
    const g = (globalThis as unknown as { __roamStore: { exhibitorGraph: ExhibitorGraph } }).__roamStore.exhibitorGraph;
    g.exhibitors.push({ id: "ex1", canonicalName: "브랜드" });
    g.participants.push({ id: "pt1", exhibitorId: "ex1", exhibitionId: booth!.exhibitionId, displayName: "브랜드" });
    g.assignments.push({ boothId: "b_a1902", participantId: "pt1", role: "primary" });
    const { data } = await (await GET(new Request("http://localhost/api/me/notes?expand=booth"))).json();
    const n = data.data[0];
    expect(n).toMatchObject({ boothId: "b_a1902", heart: true, visited: true });
    expect(n.booth).toMatchObject({ id: "b_a1902", name: booth!.name });
    expect(n.exhibition.slug).toBe("sibf-2026");
    expect(n.brand).toEqual({ exhibitorId: "ex1", participantId: "pt1", name: "브랜드" });
  });
});
