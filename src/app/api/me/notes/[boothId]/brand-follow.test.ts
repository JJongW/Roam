// UI 23(2026-11-24): 부스 하트가 브랜드 하트를 따라 맞추는지. 규칙은 lib/brands/follow.ts.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MockRepository } from "@/lib/mock/repository";
import type { Booth, BrandHeart, ExhibitorGraph, User } from "@/lib/types";

const state = vi.hoisted(() => ({ user: null as User | null }));
vi.mock("@/lib/api/session", () => ({ getCurrentUser: async () => state.user }));

import { PUT } from "./route";
import { PUT as BRAND_PUT } from "../../brand-hearts/[exhibitorId]/route";

type Store = { exhibitorGraph: ExhibitorGraph; booths: Booth[]; brandHearts: BrandHeart[] };
const st = () => (globalThis as unknown as { __roamStore: Store }).__roamStore;

function putNote(boothId: string, body: unknown) {
  return PUT(new Request(`http://localhost/api/me/notes/${boothId}`, { method: "PUT", body: JSON.stringify(body) }), {
    params: Promise.resolve({ boothId }),
  });
}

describe("PUT /api/me/notes/[boothId] — 부스 하트가 브랜드 하트도(UI 23)", () => {
  const repo = new MockRepository();
  let userId: string;
  let A1: string; // 브랜드 ex1의 부스
  let A2: string; // 브랜드 ex1의 다른 부스
  let B1: string; // 브랜드 ex2의 부스
  let NONE: string; // 대표 브랜드가 없는 부스

  const hearts = () => st().brandHearts.filter((h) => h.userId === userId);
  const heartOf = (ex: string) => hearts().find((h) => h.exhibitorId === ex);

  beforeEach(async () => {
    (globalThis as unknown as { __roamStore?: unknown }).__roamStore = undefined;
    const user = await repo.createUser("follower");
    userId = user.id;
    state.user = user;
    const sibfId = (await repo.getExhibition("sibf-2026"))!.exhibition.id;
    [A1, A2, B1, NONE] = st().booths.filter((b) => b.exhibitionId === sibfId).slice(0, 4).map((b) => b.id);
    const g = st().exhibitorGraph;
    g.exhibitors.push({ id: "ex1", canonicalName: "꽃잠" }, { id: "ex2", canonicalName: "모모상점" });
    g.participants.push(
      { id: "p1", exhibitorId: "ex1", exhibitionId: sibfId, displayName: "꽃잠" },
      { id: "p2", exhibitorId: "ex2", exhibitionId: sibfId, displayName: "모모상점" },
    );
    g.assignments.push(
      { boothId: A1, participantId: "p1", role: "primary" },
      { boothId: A2, participantId: "p1", role: "primary" },
      { boothId: B1, participantId: "p2", role: "primary" },
      // 공동 입점은 따라가지 않는다 — 대표 브랜드만.
      { boothId: B1, participantId: "p1", role: "co_exhibitor" },
    );
  });

  it("부스 하트를 남기면 그 부스의 대표 브랜드에 booth 출처 하트가 생긴다", async () => {
    expect((await putNote(A1, { heart: true })).status).toBe(200);
    expect(heartOf("ex1")).toMatchObject({ source: "booth" });
    expect(heartOf("ex2")).toBeUndefined();
  });

  it("옛 interest 경로(must)도 같이 따라간다", async () => {
    await putNote(B1, { interest: "must" });
    expect(heartOf("ex2")).toMatchObject({ source: "booth" });
    expect(heartOf("ex1")).toBeUndefined(); // 공동 입점 브랜드는 아니다
    await putNote(B1, { interest: "pass" });
    expect(heartOf("ex2")).toBeUndefined();
  });

  it("하트를 빼면 같은 브랜드의 다른 부스 하트가 없을 때만 브랜드 하트도 빠진다", async () => {
    await putNote(A1, { heart: true });
    await putNote(A2, { heart: true });
    await putNote(A1, { heart: false });
    expect(heartOf("ex1")).toBeTruthy(); // A2 하트가 남아 있다
    await putNote(A2, { heart: false });
    expect(heartOf("ex1")).toBeUndefined();
  });

  it("부스 하트 없이 직접 남긴 브랜드 하트는 부스 하트를 빼도 지우지 않는다", async () => {
    await BRAND_PUT(new Request("http://localhost", { method: "PUT" }), { params: Promise.resolve({ exhibitorId: "ex1" }) });
    await putNote(A1, { heart: true });
    expect(heartOf("ex1")).toMatchObject({ source: "direct" }); // direct를 booth로 내리지 않는다
    await putNote(A1, { heart: false });
    expect(heartOf("ex1")).toMatchObject({ source: "direct" });
  });

  it("부스 하트가 만든 줄에 직접 하트가 오면 direct로 올라가 부스 하트를 빼도 남는다", async () => {
    await putNote(A1, { heart: true });
    await BRAND_PUT(new Request("http://localhost", { method: "PUT" }), { params: Promise.resolve({ exhibitorId: "ex1" }) });
    expect(heartOf("ex1")).toMatchObject({ source: "direct" });
    await putNote(A1, { heart: false });
    expect(heartOf("ex1")).toBeTruthy();
  });

  it("하트를 건드리지 않는 쓰기(메모, 다녀왔어요)와 대표 브랜드 없는 부스는 브랜드 하트를 바꾸지 않는다", async () => {
    await putNote(A1, { memo: "엽서" });
    await putNote(A1, { visited: true });
    expect(hearts()).toHaveLength(0);
    await putNote(NONE, { heart: true });
    expect(hearts()).toHaveLength(0);
    // 이미 하트인 부스에 다시 하트를 보내도 한 줄
    await putNote(A1, { heart: true });
    await putNote(A1, { heart: true });
    expect(hearts()).toHaveLength(1);
  });

  it("브랜드 따라가기가 실패해도 부스 하트 저장은 성공한다", async () => {
    const spy = vi.spyOn(MockRepository.prototype, "listPrimaryBrandLinks").mockRejectedValueOnce(new Error("no column"));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await putNote(A1, { heart: true });
    expect(res.status).toBe(200);
    expect((await res.json()).data.note.heart).toBe(true);
    expect(err).toHaveBeenCalled();
    spy.mockRestore();
    err.mockRestore();
  });
});
