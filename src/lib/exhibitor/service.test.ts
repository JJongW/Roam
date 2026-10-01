import { describe, expect, it } from "vitest";
import { MockRepository } from "@/lib/mock/repository";
import { planFromRepository } from "./service";

// mock은 저장소 **행동**을 흉내 내지 않는다(CLAUDE.md). 이 테스트는 흐름(계획 →
// 적용 → 재계획 → 합치기)의 모양만 고정한다. 운영 확인은 dry-run으로 따로 한다.
describe("참가사 백필 흐름", () => {
  it("두 번째 실행은 아무것도 새로 만들지 않는다", async () => {
    const repo = new MockRepository();
    const first = await planFromRepository(repo);
    expect(first.plan.assignments.length).toBeGreaterThan(0);
    await repo.applyExhibitorPlan(first.plan);

    const again = await planFromRepository(repo);
    expect(again.plan.exhibitors).toEqual([]);
    expect(again.plan.participants).toEqual([]);
    expect(again.plan.assignments).toEqual([]);
    expect(again.plan.candidates).toEqual([]);
  });

  it("이름만 같은 후보를 승인하면 두 참가사가 하나가 된다", async () => {
    const repo = new MockRepository();
    const exhibitions = await repo.listExhibitions({ limit: 10 });
    const [a, b] = exhibitions.data;
    const hall = async (id: string) => (await repo.listHalls(id))[0].id;
    const cat = async (id: string) => (await repo.listCategories(id))[0].id;
    for (const ex of [a, b]) {
      await repo.createBooth({
        exhibitionId: ex.id, hallId: await hall(ex.id), categoryId: await cat(ex.id),
        name: "메멜트 테스트", company: "메멜트 테스트", description: "", longDescription: "",
        images: [], tags: [], x: 0, y: 0, popularity: 50,
      });
    }
    await repo.applyExhibitorPlan((await planFromRepository(repo)).plan);
    const pending = await repo.listExhibitorLinkCandidates("pending");
    const mine = pending.find((c) => c.reason.includes("메멜트 테스트"));
    expect(mine).toBeDefined();

    const before = (await repo.loadExhibitorGraph()).exhibitors.length;
    await repo.decideExhibitorLinkCandidate(mine!.id, "approved", null);
    const graph = await repo.loadExhibitorGraph();
    expect(graph.exhibitors.length).toBe(before - 1);
    // 두 회차의 참가 사실이 같은 참가사를 가리킨다 — 표기 이름은 회차별로 남는다.
    const owners = graph.participants.filter((p) => p.displayName === "메멜트 테스트").map((p) => p.exhibitorId);
    expect(new Set(owners).size).toBe(1);
    expect(owners).toHaveLength(2);
  });
});
