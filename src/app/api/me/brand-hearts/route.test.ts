import { beforeEach, describe, expect, it, vi } from "vitest";
import { MockRepository } from "@/lib/mock/repository";
import type { ExhibitorGraph, User } from "@/lib/types";

const state = vi.hoisted(() => ({ user: null as User | null }));
vi.mock("@/lib/api/session", () => ({ getCurrentUser: async () => state.user }));

import { GET, PUT as SYNC } from "./route";
import { DELETE, PUT } from "./[exhibitorId]/route";

const ctx = (exhibitorId: string) => ({ params: Promise.resolve({ exhibitorId }) });
const req = (body?: unknown) =>
  new Request("http://localhost", { method: "PUT", body: body ? JSON.stringify(body) : undefined });

describe("/api/me/brand-hearts", () => {
  const repo = new MockRepository();
  let sibfId: string;

  beforeEach(async () => {
    (globalThis as unknown as { __roamStore?: unknown }).__roamStore = undefined;
    state.user = await repo.createUser("hearter");
    sibfId = (await repo.getExhibition("sibf-2026"))!.exhibition.id;
    const g = (globalThis as unknown as { __roamStore: { exhibitorGraph: ExhibitorGraph } }).__roamStore.exhibitorGraph;
    g.exhibitors.push({ id: "ex1", canonicalName: "브랜드 하나" }, { id: "ex2", canonicalName: "브랜드 둘" });
    // ex1: 부스 없는 참가(브랜드 먼저 인입).
    g.participants.push({ id: "pt1", exhibitorId: "ex1", exhibitionId: sibfId, displayName: "브랜드 하나" });
  });

  it("부스 없는 참가 브랜드에도 하트를 남기고, 목록에 이름과 참가를 붙인다", async () => {
    expect((await PUT(req(), ctx("ex1"))).status).toBe(200);
    expect((await PUT(req(), ctx("ex1"))).status).toBe(200); // 두 번 눌러도 한 줄
    const body = await (await GET()).json();
    const list = body.data.data;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ exhibitorId: "ex1", name: "브랜드 하나" });
    // sibf 날짜가 지났는지에 따라 upcoming이 달라서, 모양만 확인한다.
    expect(Array.isArray(list[0].upcoming)).toBe(true);
  });

  it("없는 브랜드는 404, 빼기는 없어도 200(removed false, 끈 부스 없음)", async () => {
    expect((await PUT(req(), ctx("nope"))).status).toBe(404);
    const res = await DELETE(req(), ctx("ex2"));
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({ removed: false, source: null, unheartedBoothIds: [] });
  });

  it("로그인 뒤 기기 하트를 한 번에 올린다(합집합, 없는 id는 알려 줌)", async () => {
    await PUT(req(), ctx("ex2"));
    const res = await SYNC(req({ exhibitorIds: ["ex1", "ex1", "nope"] }));
    const body = (await res.json()).data;
    expect(body.unknown).toEqual(["nope"]);
    expect(body.data.map((h: { exhibitorId: string }) => h.exhibitorId).sort()).toEqual(["ex1", "ex2"]);
  });

  it("로그인 안 했으면 401", async () => {
    state.user = null;
    expect((await GET()).status).toBe(401);
    expect((await PUT(req(), ctx("ex1"))).status).toBe(401);
  });
});
