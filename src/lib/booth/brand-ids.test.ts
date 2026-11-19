import { beforeEach, describe, expect, it } from "vitest";
import { MockRepository } from "@/lib/mock/repository";
import type { ExhibitorGraph } from "@/lib/types";
import { withBrandIds } from "./brand-ids";

const graph = () =>
  (globalThis as unknown as { __roamStore: { exhibitorGraph: ExhibitorGraph } }).__roamStore
    .exhibitorGraph;

describe("withBrandIds", () => {
  const repo = new MockRepository();
  beforeEach(async () => {
    (globalThis as unknown as { __roamStore?: unknown }).__roamStore = undefined;
    await repo.listExhibitions(); // 스토어 초기화
  });

  it("대표 참가의 브랜드 id만 붙이고, 배정 없는 부스는 그대로 둔다", async () => {
    const g = graph();
    g.participants.push({ id: "pt1", exhibitorId: "ex1", exhibitionId: "e", displayName: "A" });
    g.participants.push({ id: "pt2", exhibitorId: "ex2", exhibitionId: "e", displayName: "B" });
    g.assignments.push({ boothId: "b1", participantId: "pt1", role: "primary" });
    g.assignments.push({ boothId: "b1", participantId: "pt2", role: "co_exhibitor" });
    const out = await withBrandIds(repo, [{ id: "b1" }, { id: "b2" }]);
    expect(out[0]).toEqual({ id: "b1", exhibitorId: "ex1", participantId: "pt1" });
    expect(out[1]).toEqual({ id: "b2" });
  });

  it("조회가 실패해도 부스는 그대로 돌려준다", async () => {
    const broken = { listPrimaryBrandLinks: async () => { throw new Error("x"); } };
    const out = await withBrandIds(broken as never, [{ id: "b1" }]);
    expect(out).toEqual([{ id: "b1" }]);
  });

  it("names를 켜면 브랜드 이름을 붙이고, 이름이 없으면 null이다", async () => {
    const g = graph();
    g.exhibitors.push({ id: "ex1", canonicalName: "꽃잠 " });
    g.participants.push({ id: "pt1", exhibitorId: "ex1", exhibitionId: "e", displayName: "꽃잠 부스" });
    g.participants.push({ id: "pt3", exhibitorId: "ex-missing", exhibitionId: "e", displayName: "C" });
    g.assignments.push({ boothId: "b1", participantId: "pt1", role: "primary" });
    g.assignments.push({ boothId: "b3", participantId: "pt3", role: "primary" });
    const out = await withBrandIds(repo, [{ id: "b1" }, { id: "b2" }, { id: "b3" }], { names: true });
    expect(out[0]).toEqual({ id: "b1", exhibitorId: "ex1", participantId: "pt1", exhibitorName: "꽃잠" });
    expect(out[1]).toEqual({ id: "b2" });
    expect(out[2]).toEqual({ id: "b3", exhibitorId: "ex-missing", participantId: "pt3", exhibitorName: null });
  });

  it("names를 안 켜면 이름 키가 없다(목록 응답은 그대로)", async () => {
    const g = graph();
    g.exhibitors.push({ id: "ex1", canonicalName: "꽃잠" });
    g.participants.push({ id: "pt1", exhibitorId: "ex1", exhibitionId: "e", displayName: "꽃잠" });
    g.assignments.push({ boothId: "b1", participantId: "pt1", role: "primary" });
    const [b] = await withBrandIds(repo, [{ id: "b1" }]);
    expect(b).not.toHaveProperty("exhibitorName");
  });

  it("이름 조회만 실패하면 id는 붙이고 이름은 null이다", async () => {
    const half = {
      listPrimaryBrandLinks: async () => ({ b1: { exhibitorId: "ex1", participantId: "pt1" } }),
      getExhibitorNames: async () => { throw new Error("x"); },
    };
    const out = await withBrandIds(half as never, [{ id: "b1" }], { names: true });
    expect(out).toEqual([{ id: "b1", exhibitorId: "ex1", participantId: "pt1", exhibitorName: null }]);
  });
});
