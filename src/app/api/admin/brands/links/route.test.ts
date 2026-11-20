// 브랜드 대조는 참가 단위(2026-11-20 Ted): 부스 없는 참가도 연결 확인에 올라오고, 승인이 된다.
// mock은 저장소 행동을 흉내 내지 않는다(CLAUDE.md). 흐름 모양만 고정한다.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getRepository } from "@/lib/repositories";
import { applyLinkPlan } from "@/lib/brands/jobs";
import { buildLinkRows } from "@/lib/brands/links";
import { planFromRepository } from "@/lib/exhibitor/service";
import { applyBrandsPlan, planBrandsFromRepository } from "@/lib/intake/brands-apply";
import type { BrandsFile } from "@/lib/intake/brands-schema";
import type { Repository } from "@/lib/repositories/types";

const auth = vi.hoisted(() => ({ admin: true }));
vi.mock("@/lib/api/http", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/api/http")>();
  return {
    ...mod,
    requireAdmin: async () => (auth.admin ? null : mod.fail("UNAUTHORIZED", "운영자 인증이 필요합니다")),
    getAdminActor: async () => "ted@example.com",
  };
});

import { POST } from "./route";

beforeEach(() => {
  (globalThis as unknown as { __roamStore?: unknown }).__roamStore = undefined;
  auth.admin = true;
});

const post = (body: unknown) =>
  POST(new Request("http://localhost/api/admin/brands/links", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }));
const audit = { source: "intake", actor: null, reason: "참가 단위 후보 테스트" };

/** 부스 연결 백필로 그래프를 채운 뒤, 다른 박람회의 brands.v1 파일에 기존 브랜드와 이름만 같은 항목을 넣는다. */
async function setup() {
  const repo = (await getRepository()) as Repository;
  const { plan } = await planFromRepository(repo);
  await applyLinkPlan(repo, plan, { actor: null });
  const graph = await repo.loadExhibitorGraph();
  const exhibitions = (await repo.listExhibitions({ limit: 50 })).data;
  const house = exhibitions.find((e) => e.slug === "house-archive-2026")!;
  const other = exhibitions.find((e) => e.slug === "magok-livingmarket-2026")!;
  // house에만 나온 브랜드 하나(이름 3자 이상).
  const target = graph.exhibitors.find((e) => {
    const ps = graph.participants.filter((p) => p.exhibitorId === e.id);
    return e.canonicalName.replace(/\s/g, "").length >= 3 && ps.length === 1 && ps[0].exhibitionId === house.id;
  })!;
  const file: BrandsFile = {
    version: "brands.v1",
    exhibitionSlug: other.slug,
    source: { url: "https://fair.example/brands", collectedAt: "2026-11-20" },
    brands: [{ key: "ny-311", name: target.canonicalName, aliases: ["NGT"] }],
  };
  const planned = await planBrandsFromRepository(repo, file);
  if (!planned.ok) throw new Error(planned.message);
  const applied = await applyBrandsPlan(repo, planned.plan, audit);
  return { repo, file, target, house, other, applied };
}

describe("POST /api/admin/brands/links — 참가 단위", () => {
  it("brands.v1이 이름만 같은 참가를 부스 없이 후보로 올리고, 홈 숫자와 화면 줄 수가 같다", async () => {
    const { repo, target, other, applied } = await setup();
    expect(applied.createdCandidates).toBe(1);
    const pending = await repo.listExhibitorLinkCandidates("pending");
    const c = pending.find((x) => x.exhibitorId === target.id && x.boothId === null)!;
    expect(c).toBeTruthy();
    expect(c.participantId).toBeTruthy();

    const graph = await repo.loadExhibitorGraph();
    const exhibitions = (await repo.listExhibitions({ limit: 50 })).data;
    const booths = (await Promise.all(exhibitions.map((e) => repo.listBoothsFull(e.id)))).flat();
    const rows = buildLinkRows({ candidates: pending, graph, booths, exhibitions, fields: [] });
    expect(rows).toHaveLength(pending.length);
    const row = rows.find((r) => r.id === c.id)!;
    expect(row.subject).toMatchObject({ participantId: c.participantId, exhibitionName: other.name, name: target.canonicalName });
    expect(row.subject?.boothId).toBeUndefined();
    expect(row.evidence).toContain(`이름이 같아요: ${target.canonicalName}`);
    expect(row.evidence).toContain("이 참가의 다른 이름: NGT");
    expect(row.evidence.some((e) => e.startsWith("브랜드가 나온 박람회:"))).toBe(true);
    expect(row.target.appearances.length).toBeGreaterThan(0);
  });

  it("부스 없는 후보를 승인하면 새 브랜드가 기존 브랜드로 합쳐지고 참가가 따라간다. 다시 올려도 중복이 없다", async () => {
    const { repo, file, target, other } = await setup();
    const [c] = (await repo.listExhibitorLinkCandidates("pending")).filter((x) => x.exhibitorId === target.id && !x.boothId);
    const before = await repo.loadExhibitorGraph();
    const from = before.participants.find((p) => p.id === c.participantId)!.exhibitorId;
    expect(from).not.toBe(target.id);

    const res = await post({ ids: [c.id], decision: "approved" });
    expect(res.status).toBe(200);
    expect((await res.json()).data).toMatchObject({ done: 1, skipped: 0 });

    const after = await repo.loadExhibitorGraph();
    expect(after.exhibitors.some((e) => e.id === from)).toBe(false);
    expect(after.participants.find((p) => p.id === c.participantId)).toMatchObject({ exhibitorId: target.id, exhibitionId: other.id });
    const merged = after.exhibitors.find((e) => e.id === target.id)!;
    expect(merged.aliases).toContain("NGT");
    expect(merged.brandKeys?.length).toBeGreaterThan(0);

    // 같은 파일을 다시 올려도 합친 브랜드를 파일 키로 찾는다 — 새 브랜드, 새 참가, 새 후보 0.
    const again = await planBrandsFromRepository(repo, file);
    if (!again.ok) throw new Error(again.message);
    expect(again.plan.summary).toMatchObject({ newBrands: 0, participantsToCreate: 0, candidates: 0 });
    expect(again.plan.brands[0]).toMatchObject({ target: { existing: target.id }, matchedBy: "brandKey" });
  });

  it("반려한 짝은 다시 올려도 다시 묻지 않는다. 부스 후보도 그대로 된다", async () => {
    const { repo, file, target } = await setup();
    const all = await repo.listExhibitorLinkCandidates("pending");
    const c = all.find((x) => x.exhibitorId === target.id && !x.boothId)!;
    expect((await (await post({ ids: [c.id], decision: "rejected" })).json()).data).toMatchObject({ done: 1 });
    const again = await planBrandsFromRepository(repo, file);
    if (!again.ok) throw new Error(again.message);
    expect(again.plan.summary.candidates).toBe(0);

    const boothCand = all.find((x) => x.boothId);
    if (boothCand) {
      const r = await post({ ids: [boothCand.id], decision: "approved" });
      expect((await r.json()).data).toMatchObject({ done: 1 });
    }
  });

  it("운영자가 아니면 401", async () => {
    auth.admin = false;
    expect((await post({ ids: ["x"], decision: "approved" })).status).toBe(401);
  });
});
