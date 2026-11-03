import { beforeEach, describe, expect, it } from "vitest";
import { MockRepository } from "@/lib/mock/repository";
import { planFromRepository } from "@/lib/exhibitor/service";
import {
  BRAND_DRAFT_CHUNK,
  BRAND_DRAFT_JOB,
  applyLinkPlan,
  diffGraph,
  enqueueBrandDrafts,
  enqueueExhibitionDrafts,
  markStaleForNewAppearance,
} from "./jobs";
import type { ExhibitorGraph } from "@/lib/types";

beforeEach(() => {
  (globalThis as unknown as { __roamStore?: unknown }).__roamStore = undefined;
});

describe("diffGraph", () => {
  it("새 브랜드와, 새 출전이 이어진 기존 브랜드를 박람회와 함께 가른다", () => {
    const before: ExhibitorGraph = {
      exhibitors: [{ id: "x1", canonicalName: "a" }],
      participants: [{ id: "p1", exhibitorId: "x1", exhibitionId: "e1", displayName: "a" }],
      assignments: [],
      candidates: [],
    };
    const after: ExhibitorGraph = {
      ...before,
      exhibitors: [...before.exhibitors, { id: "x2", canonicalName: "b" }],
      participants: [
        ...before.participants,
        { id: "p2", exhibitorId: "x1", exhibitionId: "e2", displayName: "a" },
        { id: "p3", exhibitorId: "x2", exhibitionId: "e2", displayName: "b" },
      ],
    };
    expect(diffGraph(before, after)).toEqual({
      newExhibitors: ["x2"],
      newAppearance: ["x1"],
      newAppearanceIn: [{ exhibitorId: "x1", exhibitionId: "e2" }],
    });
  });
});

async function backfilled() {
  const repo = new MockRepository();
  const { plan } = await planFromRepository(repo);
  const r = await applyLinkPlan(repo, plan, { actor: "ted" });
  return { repo, r, plan };
}

describe("잡은 박람회 단위로만", () => {
  it("백필(모든 박람회)은 새 브랜드가 많아도 잡을 넣지 않는다", async () => {
    const { repo, r, plan } = await backfilled();
    expect(r.newExhibitors).toBe(plan.exhibitors.length);
    expect(r.enqueued).toEqual({ jobIds: [], brands: 0 });
    expect(await repo.listJobs({ type: BRAND_DRAFT_JOB })).toHaveLength(0);
  });

  it("박람회를 골라 넣으면 그 박람회 브랜드만, 20곳씩, 이미 다 채운 곳과 대기 중인 곳은 뺀다", async () => {
    const { repo } = await backfilled();
    const graph = await repo.loadExhibitorGraph();
    const ha = graph.participants.filter((p) => p.exhibitionId === "exh_house_archive_2026").map((p) => p.exhibitorId);
    const done = ha[0];
    for (const field of ["links", "aliases", "intro", "identityLine", "items", "signatureWorks", "texture"])
      await repo.upsertProfileField({ subject: { exhibitorId: done }, field, value: field === "intro" ? { original: "x" } : ["x"], sources: ["https://a.example"], status: "reviewed", actor: "ted" });
    const r = await enqueueExhibitionDrafts(repo, "exh_house_archive_2026", { actor: "ted" });
    expect(r.complete).toBe(1);
    expect(r.brands).toBe(new Set(ha).size - 1);
    expect(r.jobIds).toHaveLength(Math.ceil(r.brands / BRAND_DRAFT_CHUNK));
    const queued = (await repo.listJobs({ type: BRAND_DRAFT_JOB, status: "queued", limit: 100 })).flatMap((j) => j.payload.exhibitorIds as string[]);
    expect(queued).not.toContain(done);
    expect(queued.every((id) => ha.includes(id))).toBe(true);
    // 다시 눌러도 대기 중인 곳은 안 넣는다
    expect((await enqueueExhibitionDrafts(repo, "exh_house_archive_2026", { actor: "ted" })).brands).toBe(0);
    expect(await enqueueBrandDrafts(repo, [ha[1]], { actor: null, reason: "버튼" })).toEqual({ jobIds: [], brands: 0 });
  });

  it("인입(박람회 하나)이 기존 브랜드에 새 출전을 이으면 그 박람회 것만 잡에 넣고 stale로 돌린다", async () => {
    const { repo } = await backfilled();
    const graph = await repo.loadExhibitorGraph();
    const x = graph.participants.find((p) => p.exhibitionId === "exh_sif_2026")!.exhibitorId;
    await repo.upsertProfileField({ subject: { exhibitorId: x }, field: "items", value: ["스티커"], sources: ["https://a.example"], status: "reviewed", actor: "ted" });
    const magokBooth = (await repo.listBoothsFull("exh_magok_livingmarket_2026"))[0];
    const plan = {
      exhibitors: [],
      participants: [{ key: "k1", exhibitorRef: { existing: x }, exhibitionId: "exh_magok_livingmarket_2026", displayName: "새 출전" }],
      assignments: [{ boothId: magokBooth.id, participantRef: { new: "k1" }, role: "primary" as const }],
      candidates: [],
    };
    const other = await applyLinkPlan(repo, plan, { actor: "ted", exhibitionId: "exh_sibf_2026" });
    expect(other.newAppearance).toBe(1);
    expect(other.enqueued.brands).toBe(0); // 다른 박람회 범위면 안 넣는다
    expect(other.staled).toBe(1);
    expect((await repo.listProfileFields({ exhibitorIds: [x] }))[0]).toMatchObject({ status: "stale", value: ["스티커"] });

    const plan2 = { ...plan, participants: [{ ...plan.participants[0], key: "k2" }], assignments: [{ ...plan.assignments[0], participantRef: { new: "k2" } }] };
    const same = await applyLinkPlan(repo, plan2, { actor: "ted", exhibitionId: "exh_magok_livingmarket_2026" });
    expect(same.enqueued.brands).toBe(1);
  });

  it("stale은 품목, 가격대, 대표 작품만", async () => {
    const { repo } = await backfilled();
    const x = (await repo.loadExhibitorGraph()).exhibitors[0].id;
    const put = (field: string, value: unknown) =>
      repo.upsertProfileField({ subject: { exhibitorId: x }, field, value, sources: ["https://a.example"], status: "reviewed", actor: "ted" });
    await put("items", ["스티커"]);
    await put("artistName", "작가");
    expect(await markStaleForNewAppearance(repo, [x])).toBe(1);
    const fields = await repo.listProfileFields({ exhibitorIds: [x] });
    expect(fields.find((f) => f.field === "items")).toMatchObject({ status: "stale", actor: "system:new-appearance" });
    expect(fields.find((f) => f.field === "artistName")!.status).toBe("reviewed");
  });
});
