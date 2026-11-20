import { beforeEach, describe, expect, it, vi } from "vitest";
import { MockRepository } from "@/lib/mock/repository";
import type { Exhibition, ExhibitorGraph, User } from "@/lib/types";

const state = vi.hoisted(() => ({ user: null as User | null }));
vi.mock("@/lib/api/session", () => ({ getCurrentUser: async () => state.user }));

import { GET } from "./route";

type Store = { exhibitorGraph: ExhibitorGraph; exhibitions: Exhibition[] };

describe("GET /api/me/reentry", () => {
  const repo = new MockRepository();

  beforeEach(async () => {
    (globalThis as unknown as { __roamStore?: unknown }).__roamStore = undefined;
    state.user = await repo.createUser("returner");
  });

  it("로그인 안 했으면 401", async () => {
    state.user = null;
    expect((await GET()).status).toBe(401);
  });

  it("좋았어요를 남긴 부스의 브랜드가 다음 박람회에 참가하면(부스 없이) 돌려준다", async () => {
    const sibf = (await repo.getExhibition("sibf-2026"))!.exhibition;
    const st = (globalThis as unknown as { __roamStore: Store }).__roamStore;
    const nextFair: Exhibition = { ...sibf, id: "next-fair", slug: "next-fair", name: "다음 페어", startDate: "2099-12-04", endDate: "2099-12-07" };
    st.exhibitions.push(nextFair);
    const g = st.exhibitorGraph;
    g.exhibitors.push({ id: "exA", canonicalName: "돌과풀" }, { id: "exB", canonicalName: "다녀오기만" });
    g.participants.push(
      { id: "pA1", exhibitorId: "exA", exhibitionId: sibf.id, displayName: "돌과풀" },
      { id: "pA2", exhibitorId: "exA", exhibitionId: "next-fair", displayName: "돌과풀" },
      { id: "pB1", exhibitorId: "exB", exhibitionId: sibf.id, displayName: "다녀오기만" },
      { id: "pB2", exhibitorId: "exB", exhibitionId: "next-fair", displayName: "다녀오기만" },
    );
    const [b1, b2] = (await repo.listBoothsByExhibitionId(sibf.id)).map((b) => b.id);
    g.assignments.push({ boothId: b1, participantId: "pA1", role: "primary" }, { boothId: b2, participantId: "pB1", role: "primary" });
    await repo.upsertNote(state.user!.id, b1, { visited: true, verdict: "good" }, "confident");
    await repo.upsertNote(state.user!.id, b2, { visited: true }, undefined);

    const body = (await (await GET()).json()).data.data;
    expect(body.brands.map((b: { exhibitorId: string }) => b.exhibitorId)).toEqual(["exA"]);
    expect(body.brands[0]).toMatchObject({ name: "돌과풀", reasons: ["verdict_good"], hearted: false });
    expect(body.brands[0].next.exhibition.slug).toBe("next-fair");
    expect(body.brands[0].next.booth).toBeUndefined();
  });
});
