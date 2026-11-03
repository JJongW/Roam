import { beforeEach, describe, expect, it } from "vitest";
import { MockRepository } from "./repository";
import { planFromRepository } from "@/lib/exhibitor/service";
import { buildLinkRows } from "@/lib/brands/links";

beforeEach(() => {
  (globalThis as unknown as { __roamStore?: unknown }).__roamStore = undefined;
});

async function backfill(repo: MockRepository) {
  const { plan } = await planFromRepository(repo);
  return repo.applyExhibitorPlan(plan);
}

describe("MockRepository 브랜드 프로필 칸(0061)", () => {
  const repo = new MockRepository();

  it("없는 브랜드면 null, 저장하고 읽고 비운다", async () => {
    expect(
      await repo.upsertProfileField({ subject: { exhibitorId: "nope" }, field: "items", value: ["스티커"], sources: [], status: "reviewed", actor: null }),
    ).toBeNull();
    await backfill(repo);
    const { exhibitors, participants } = await repo.loadExhibitorGraph();
    const x = exhibitors[0].id;
    const p = participants.find((pp) => pp.exhibitorId === x)!.id;
    const f = await repo.upsertProfileField({ subject: { exhibitorId: x }, field: "items", value: ["스티커"], sources: ["https://a.b"], status: "reviewed", actor: "ted" });
    expect(f).toMatchObject({ id: `ex:${x}:items`, exhibitorId: x, participantId: null, status: "reviewed", actor: "ted" });
    await repo.upsertProfileField({ subject: { participantId: p }, field: "days", value: "토", sources: [], status: "collected", actor: null });
    // 다시 쓰면 같은 행(생성 시각 유지)
    const again = await repo.upsertProfileField({ subject: { exhibitorId: x }, field: "items", value: ["엽서"], sources: [], status: "ai_draft", actor: "worker" });
    expect(again!.createdAt).toBe(f!.createdAt);
    expect(await repo.listProfileFields({ exhibitorIds: [x] })).toHaveLength(1);
    expect(await repo.listProfileFields({ participantIds: [p] })).toHaveLength(1);
    expect(await repo.listProfileFields()).toHaveLength(2);
    expect(await repo.deleteProfileField({ exhibitorId: x }, "items")).toBe(true);
    expect(await repo.deleteProfileField({ exhibitorId: x }, "items")).toBe(false);
  });

  it("연결 승인으로 브랜드를 합치면 칸을 옮긴다(겹치면 대상 것을 지킨다)", async () => {
    await backfill(repo);
    const [cand] = await repo.listExhibitorLinkCandidates("pending");
    const graph = await repo.loadExhibitorGraph();
    const asg = graph.assignments.find((a) => a.boothId === cand.boothId && a.role === "primary")!;
    const from = graph.participants.find((p) => p.id === asg.participantId)!.exhibitorId;
    const to = cand.exhibitorId;
    const put = (exhibitorId: string, field: string, value: unknown) =>
      repo.upsertProfileField({ subject: { exhibitorId }, field, value, sources: [], status: "reviewed", actor: null });
    await put(from, "items", ["스티커"]);
    await put(from, "artistName", "옛 이름");
    await put(to, "artistName", "대상 이름");

    await repo.decideExhibitorLinkCandidate(cand.id, "approved", "ted");
    const fields = await repo.listProfileFields({ exhibitorIds: [to, from] });
    expect(fields.every((f) => f.exhibitorId === to)).toBe(true);
    expect(fields.find((f) => f.field === "items")!.value).toEqual(["스티커"]);
    expect(fields.find((f) => f.field === "artistName")!.value).toBe("대상 이름");
  });

  it("연결 안 함으로 둔 짝은 다시 백필해도 다시 묻지 않는다", async () => {
    await backfill(repo);
    const pending = await repo.listExhibitorLinkCandidates("pending");
    expect(pending.length).toBeGreaterThan(0);
    for (const c of pending) await repo.decideExhibitorLinkCandidate(c.id, "rejected", null);
    const again = await backfill(repo);
    expect(again.candidates).toBe(0);
    expect(await repo.listExhibitorLinkCandidates("pending")).toHaveLength(0);
    expect((await repo.listExhibitorLinkCandidates("rejected")).length).toBe(pending.length);
  });

  it("연결 확인 줄에 근거를 붙인다", async () => {
    await backfill(repo);
    const [exhibitions, graph, candidates] = await Promise.all([
      repo.listExhibitions({ limit: 50 }),
      repo.loadExhibitorGraph(),
      repo.listExhibitorLinkCandidates("pending"),
    ]);
    const booths = (await Promise.all(exhibitions.data.map((e) => repo.listBoothsFull(e.id)))).flat();
    const rows = buildLinkRows({ candidates, graph, booths, exhibitions: exhibitions.data, fields: [] });
    expect(rows).toHaveLength(candidates.length);
    expect(rows[0].evidence.some((e) => e.startsWith("이름이 같아요"))).toBe(true);
    expect(rows[0].target.appearances.length).toBeGreaterThan(0);
    expect(rows[0].booth).not.toBeNull();
  });
});
