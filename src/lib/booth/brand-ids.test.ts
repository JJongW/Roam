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
});
