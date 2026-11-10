import { beforeEach, describe, expect, it, vi } from "vitest";
import { MockRepository } from "@/lib/mock/repository";
import { planFromRepository } from "@/lib/exhibitor/service";
import { hasRealBlurb } from "@/lib/booth/blurb";
import { TONE_SYSTEM, draftSystemPrompt, mayFetch, runBrandProfileDraft, type DraftDeps } from "./draft";
import { hasBatchim } from "./tone-gate";

beforeEach(() => {
  (globalThis as unknown as { __roamStore?: unknown }).__roamStore = undefined;
});

/** 결정적인 가짜 말투 변환 — 합니다체 끝을 해요체로, 가운뎃점을 쉼표로. 내용은 그대로. */
export function fakeTone(original: string): string {
  return original
    .replace(/·/g, ", ")
    .replace(/바랍니다\./g, "바라요.")
    .replace(/([가-힣])입니다\./g, (_, c: string) => c + (hasBatchim(c) ? "이에요." : "예요."))
    .replace(/합니다\./g, "해요.")
    .replace(/됩니다\./g, "돼요.")
    .replace(/습니다\./g, "어요.");
}

async function setup() {
  const repo = new MockRepository();
  const { plan } = await planFromRepository(repo);
  await repo.applyExhibitorPlan(plan);
  const graph = await repo.loadExhibitorGraph();
  const booths = await repo.listBoothsFull("exh_house_archive_2026");
  const real = booths.filter((b) => hasRealBlurb(b.description, { name: b.name, code: b.code, company: b.company }));
  const exhibitorOf = (boothId: string) => {
    const a = graph.assignments.find((x) => x.boothId === boothId && x.role === "primary")!;
    return graph.participants.find((p) => p.id === a.participantId)!.exhibitorId;
  };
  return { repo, real, exhibitorOf };
}

describe("runBrandProfileDraft", () => {
  it("LLM 없이도 링크, 다른 이름, 소개 원문은 모은다(소개는 앱에 안 보임)", async () => {
    const { repo, real, exhibitorOf } = await setup();
    const x = exhibitorOf(real[0].id);
    const r = await runBrandProfileDraft(repo, x, {});
    if ("error" in r) throw new Error(r.error);
    expect(r.usedLlm).toBe(false);
    const fields = await repo.listProfileFields({ exhibitorIds: [x] });
    const intro = fields.find((f) => f.field === "intro")!;
    expect(intro).toMatchObject({ status: "collected", sources: [`roam:booth/${real[0].id}`], actor: "worker:brand-profile-draft" });
    expect(intro.value).toEqual({ original: real[0].description.trim() });
    expect(r.skipped.some((s) => s.field === "ai")).toBe(true);
  });

  it("말투 변환이 게이트를 넘으면 collected, 못 넘으면 ai_draft", async () => {
    const { repo, real, exhibitorOf } = await setup();
    const good = exhibitorOf(real[0].id);
    const bad = exhibitorOf(real[1].id);
    const r1 = await runBrandProfileDraft(repo, good, { convertTone: async ({ original }) => fakeTone(original) });
    if ("error" in r1) throw new Error(r1.error);
    expect(r1.gate).toEqual({ ok: true, issues: [] });
    expect((await repo.listProfileFields({ exhibitorIds: [good] })).find((f) => f.field === "intro")!.status).toBe("collected");

    // 숫자를 지어 넣고 과장을 붙이는 나쁜 변환
    const r2 = await runBrandProfileDraft(repo, bad, { convertTone: async ({ original }) => `최고의 브랜드예요. 2030년부터 ${fakeTone(original)}` });
    if ("error" in r2) throw new Error(r2.error);
    expect(r2.gate!.ok).toBe(false);
    const f = (await repo.listProfileFields({ exhibitorIds: [bad] })).find((x) => x.field === "intro")!;
    expect(f.status).toBe("ai_draft");
    expect((f.value as { gate: { issues: string[] } }).gate.issues).toContain("원문에 없는 과장이나 단정이 생겼어요: 최고");
  });

  it("원문만 모아 둔 공식 소개(브랜드 먼저 인입)는 원문과 출처를 그대로 두고 말투만 채운다", async () => {
    const { repo, real, exhibitorOf } = await setup();
    const x = exhibitorOf(real[0].id);
    await repo.upsertProfileField({
      subject: { exhibitorId: x },
      field: "intro",
      value: { original: "손으로 그릇을 빚습니다." },
      sources: ["https://fair.example/x"],
      status: "collected",
      actor: "system:brands-intake",
    });
    const r = await runBrandProfileDraft(repo, x, { convertTone: async ({ original }) => fakeTone(original) });
    if ("error" in r) throw new Error(r.error);
    const f = (await repo.listProfileFields({ exhibitorIds: [x] })).find((y) => y.field === "intro")!;
    expect(f).toMatchObject({ status: "collected", sources: ["https://fair.example/x"] });
    expect(f.value).toMatchObject({ original: "손으로 그릇을 빚습니다.", display: "손으로 그릇을 빚어요.", gate: { ok: true } });

    // 작가 확인 소개는 사람 몫이라 건드리지 않는다.
    await repo.upsertProfileField({ subject: { exhibitorId: x }, field: "intro", value: { original: "작가 원문입니다." }, sources: ["contact-log:1"], status: "artist_confirmed", actor: "ted" });
    await runBrandProfileDraft(repo, x, { convertTone: async ({ original }) => fakeTone(original) });
    expect((await repo.listProfileFields({ exhibitorIds: [x] })).find((y) => y.field === "intro")!.value).toEqual({ original: "작가 원문입니다." });
  });

  it("AI 초안 칸: 출처 필수, 목록 밖 품목은 버리고, 사람이 확인한 칸은 덮지 않는다", async () => {
    const { repo, real, exhibitorOf } = await setup();
    const x = exhibitorOf(real[0].id);
    await repo.upsertProfileField({ subject: { exhibitorId: x }, field: "signatureWorks", value: ["사람이 쓴 것"], sources: ["https://a.example"], status: "reviewed", actor: "ted" });
    const src = `roam:booth/${real[0].id}`;
    const draftFields = vi.fn<NonNullable<DraftDeps["draftFields"]>>(async () => ({
      fields: [
        { field: "items", value: ["포스터", "엽서"], sources: [src] },
        { field: "texture", value: { tags: ["일상툰"], note: "손그림 정원" }, sources: [] }, // 출처 없음
        { field: "signatureWorks", value: ["덮으면 안 됨"], sources: [src] }, // 이미 reviewed
        { field: "identityLine", value: "직접 그린 정원 그림을 소품에 담는 브랜드예요", sources: ["https://지어낸.example"] }, // 자료에 없는 출처
      ],
    }));
    const r = await runBrandProfileDraft(repo, x, { draftFields });
    if ("error" in r) throw new Error(r.error);
    const fields = await repo.listProfileFields({ exhibitorIds: [x] });
    expect(fields.find((f) => f.field === "items")).toMatchObject({ status: "ai_draft", value: ["포스터", "엽서"], sources: [src] });
    expect(fields.find((f) => f.field === "texture")).toBeUndefined();
    expect(fields.find((f) => f.field === "identityLine")).toBeUndefined();
    expect(fields.find((f) => f.field === "signatureWorks")!.value).toEqual(["사람이 쓴 것"]);
    // 자료에 인스타 본문은 없다 — 프롬프트 자료 id는 roam:booth와 허용된 URL뿐.
    expect(draftFields.mock.calls[0][0].prompt).not.toMatch(/instagram\.com\/[^\s]*\]/);
  });

  it("정체 한 줄은 근거 칸이 없으면 쓰지 않는다", async () => {
    const { repo, real, exhibitorOf } = await setup();
    // 실제 소개가 없는(합성 소개뿐인) 브랜드는 자료가 없어 LLM을 부르지 않는다.
    const sif = await repo.listBoothsFull("exh_sif_2026");
    const synth = sif.find((b) => !hasRealBlurb(b.description, { name: b.name, code: b.code, company: b.company }) && !(b.enrichment?.goodsKeywords?.length))!;
    const draftFields = vi.fn(async () => ({ fields: [] }));
    const r = await runBrandProfileDraft(repo, exhibitorOf(synth.id), { draftFields });
    if ("error" in r) throw new Error(r.error);
    expect(draftFields).not.toHaveBeenCalled();
    expect(r.skipped.find((s) => s.field === "ai")!.reason).toContain("자료가 없어요");

    // 소개가 있으면(근거 있음) 정체 한 줄을 쓴다.
    const x = exhibitorOf(real[0].id);
    const src = `roam:booth/${real[0].id}`;
    await runBrandProfileDraft(repo, x, {
      convertTone: async ({ original }) => fakeTone(original),
      draftFields: async () => ({ fields: [{ field: "identityLine", value: "그림을 소품에 담는 아트 브랜드예요", sources: [src] }] }),
    });
    expect((await repo.listProfileFields({ exhibitorIds: [x] })).find((f) => f.field === "identityLine")!.status).toBe("ai_draft");
  });

  it("지난 검수에서 고친 예를 다음 초안 지침에 넣는다", async () => {
    const { repo, real, exhibitorOf } = await setup();
    await repo.recordChange({
      entity: "brand_profile_field",
      entityId: "ex:other:identityLine",
      source: "admin",
      fieldDiffs: { status: { before: "ai_draft", after: "reviewed" }, value: { before: "옛", after: "고친 한 줄이에요" } },
    });
    const draftFields = vi.fn<NonNullable<DraftDeps["draftFields"]>>(async () => ({ fields: [] }));
    await runBrandProfileDraft(repo, exhibitorOf(real[0].id), { draftFields });
    expect(draftFields.mock.calls[0]![0].system).toContain("고친 한 줄이에요");
  });

  it("판단 기준(프롬프트)이 브랜드 규칙을 담고 있다 — 코드에 둔 프롬프트가 규칙에서 벗어나지 않게", () => {
    for (const p of [TONE_SYSTEM, draftSystemPrompt([])]) {
      expect(p).toContain("해요체");
      expect(p).toContain('"전시"');
      expect(p).toContain("가운뎃점");
    }
    expect(draftSystemPrompt([])).toContain("sources");
  });

  it("인스타와 판매 페이지는 읽지 않는다", () => {
    expect(mayFetch("https://www.instagram.com/heedagarden")).toBe(false);
    expect(mayFetch("https://smartstore.naver.com/abc")).toBe(false);
    expect(mayFetch("https://heedagarden.com/about")).toBe(true);
    expect(mayFetch("ftp://x")).toBe(false);
  });
});
