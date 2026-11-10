import { beforeEach, describe, expect, it } from "vitest";
import { MockRepository } from "@/lib/mock/repository";
import { planFromRepository } from "@/lib/exhibitor/service";
import { applyLinkPlan, BRAND_DRAFT_JOB } from "@/lib/brands/jobs";
import { applyBrandsPlan, BRANDS_INTAKE_ACTOR, planBrandsFromRepository } from "./brands-apply";
import type { BrandsFile } from "./brands-schema";

// mock은 저장소 행동을 흉내 내지 않는다(CLAUDE.md). 여기서는 흐름(계획 → 적용 → 다시 돌림 →
// 부스가 나중에 들어옴)의 모양만 고정한다. 운영 확인은 dry-run으로 따로 한다.
beforeEach(() => {
  (globalThis as unknown as { __roamStore?: unknown }).__roamStore = undefined;
});

const EXH = "house-archive-2026";
const EXH_ID = "exh_house_archive_2026";
const audit = { source: "intake", actor: null, reason: "브랜드 인입 테스트" };
const file = (brands: BrandsFile["brands"], exhibitionSlug: string | null = EXH): BrandsFile => ({
  version: "brands.v1",
  exhibitionSlug,
  source: { url: "https://fair.example/brands", collectedAt: "2026-11-10" },
  brands,
});

async function planOk(repo: MockRepository, f: BrandsFile) {
  const r = await planBrandsFromRepository(repo, f);
  if (!r.ok) throw new Error(r.message);
  return r.plan;
}

describe("브랜드 먼저 인입 — 적용", () => {
  it("브랜드, 참가 사실, 빈 칸을 넣고 이력을 남긴다. 다시 돌리면 아무것도 새로 만들지 않는다", async () => {
    const repo = new MockRepository();
    const f = file([
      {
        key: "zz1",
        name: "브랜드먼저공방",
        instagramUrl: "https://instagram.com/brand_first_test",
        intro: { text: "손으로 빚는 그릇을 만듭니다.", status: "collected", source: "https://fair.example/zz1" },
        photos: [{ path: "house-archive-2026/zz1.webp", scope: "앱" }],
      },
      { key: "zz2", name: "인스타없는공방" },
    ]);
    const plan = await planOk(repo, f);
    expect(plan.summary).toMatchObject({ newBrands: 2, participantsToCreate: 2, fieldsToFill: 3 });

    const r = await applyBrandsPlan(repo, plan, audit);
    expect(r).toMatchObject({ createdBrands: 2, createdParticipants: 2, filledFields: 3, failures: [] });

    const graph = await repo.loadExhibitorGraph();
    const ex = graph.exhibitors.find((e) => e.canonicalName === "브랜드먼저공방")!;
    expect(graph.participants.filter((p) => p.exhibitorId === ex.id)).toEqual([
      expect.objectContaining({ exhibitionId: EXH_ID, displayName: "브랜드먼저공방" }),
    ]);
    const fields = await repo.listProfileFields({ exhibitorIds: [ex.id] });
    expect(fields.find((x) => x.field === "intro")).toMatchObject({
      status: "collected",
      value: { original: "손으로 빚는 그릇을 만듭니다." },
      sources: ["https://fair.example/zz1"],
      actor: BRANDS_INTAKE_ACTOR,
    });
    const changes = await repo.listChanges({ limit: 100 });
    expect(changes.filter((c) => c.source === "intake").map((c) => c.entity).sort()).toEqual([
      "brand_profile_field",
      "brand_profile_field",
      "brand_profile_field",
      "exhibition_participant",
      "exhibition_participant",
      "exhibitor",
      "exhibitor",
    ]);

    // 다시 돌림 — 인스타 없는 브랜드도 파일 키로 찾는다.
    const again = await planOk(repo, f);
    expect(again.summary).toMatchObject({ newBrands: 0, linkedBrands: 2, participantsToCreate: 0, participantsExisting: 2, fieldsToFill: 0 });
    expect(again.brands.map((b) => b.matchedBy).sort()).toEqual(["brandKey", "identity"]);
    const r2 = await applyBrandsPlan(repo, again, audit);
    expect(r2).toMatchObject({ createdBrands: 0, createdParticipants: 0, filledFields: 0 });
    expect((await repo.loadExhibitorGraph()).exhibitors.length).toBe(graph.exhibitors.length);
  });

  it("행사가 없는 파일은 참가 사실 없이 브랜드만 넣는다", async () => {
    const repo = new MockRepository();
    const plan = await planOk(repo, file([{ key: "solo", name: "혼자인브랜드" }], null));
    const r = await applyBrandsPlan(repo, plan, audit);
    expect(r).toMatchObject({ createdBrands: 1, createdParticipants: 0 });
  });

  it("없는 행사면 계획하지 않는다", async () => {
    const r = await planBrandsFromRepository(new MockRepository(), file([{ key: "a", name: "가나다" }], "no-such-fair"));
    expect(r).toEqual({ ok: false, message: "행사를 찾을 수 없어요: no-such-fair" });
  });

  it("부스가 나중에 들어오면 같은 행사의 이름으로 그 참가 사실에 잇는다(새 브랜드를 만들지 않는다)", async () => {
    const repo = new MockRepository();
    await applyBrandsPlan(repo, await planOk(repo, file([{ key: "late", name: "나중부스공방" }])), audit);
    const before = await repo.loadExhibitorGraph();
    const pt = before.participants.find((p) => p.displayName === "나중부스공방")!;

    const hallId = (await repo.listHalls(EXH_ID))[0].id;
    const categoryId = (await repo.listCategories())[0].id;
    const booth = await repo.createBooth({
      exhibitionId: EXH_ID, hallId, categoryId, code: "ZZ-1", name: "나중부스 공방", company: "",
      description: "", longDescription: "", images: [], tags: [], x: 0, y: 0, popularity: 50,
    });
    const { plan } = await planFromRepository(repo);
    const mine = plan.assignments.filter((a) => a.boothId === booth.id);
    expect(mine).toEqual([{ boothId: booth.id, participantRef: { existing: pt.id }, role: "primary" }]);
    expect(plan.exhibitors.some((e) => e.canonicalName === "나중부스 공방")).toBe(false);
  });

  it("기존 브랜드에 이 행사 출전이 새로 이어지면 stale로 돌리고 그 행사 초안 잡에 넣는다", async () => {
    const repo = new MockRepository();
    await applyLinkPlan(repo, (await planFromRepository(repo)).plan, { actor: null });
    const graph = await repo.loadExhibitorGraph();
    // 이 행사에 아직 안 나온 기존 브랜드 하나에 인스타를 붙여 둔다(mock 그래프는 같은 객체를 돌려준다).
    const inHouse = new Set(graph.participants.filter((p) => p.exhibitionId === EXH_ID).map((p) => p.exhibitorId));
    const other = graph.exhibitors.find((e) => !inHouse.has(e.id))!;
    other.instagramUrl = "https://instagram.com/known_brand_x";
    await repo.upsertProfileField({ subject: { exhibitorId: other.id }, field: "items", value: ["스티커"], sources: ["https://a.example"], status: "reviewed", actor: "ted" });

    const plan = await planOk(repo, file([{ key: "k", name: "알던 브랜드", instagramUrl: "https://instagram.com/known_brand_x" }]));
    expect(plan.brands[0]).toMatchObject({ target: { existing: other.id }, participant: "create" });
    const r = await applyBrandsPlan(repo, plan, audit);
    expect(r.staled).toBe(1);
    expect(r.enqueued.brands).toBe(1);
    const queued = (await repo.listJobs({ type: BRAND_DRAFT_JOB, status: "queued", limit: 100 })).flatMap((j) => j.payload.exhibitorIds as string[]);
    expect(queued).toContain(other.id);
  });
});
