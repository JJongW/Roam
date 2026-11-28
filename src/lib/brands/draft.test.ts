import { beforeEach, describe, expect, it, vi } from "vitest";
import { MockRepository } from "@/lib/mock/repository";
import { planFromRepository } from "@/lib/exhibitor/service";
import { hasRealBlurb } from "@/lib/booth/blurb";
import { CHANGED_REASON, TONE_SYSTEM, draftSystemPrompt, mayFetch, rewriteIntro, runBrandProfileDraft, type DraftDeps } from "./draft";
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
    // 원문에 행사 이름이 든 소개는 게이트가 거른다(2026-11-28). 통과 쪽은 행사 이름이 없는 원문으로 고른다.
    const clean = real.filter((b) => !b.description.includes("하우스 아카이브"));
    const good = exhibitorOf(clean[0].id);
    const bad = exhibitorOf(clean[1].id);
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

  it("모델이 낸 소개는 정돈한 뒤 게이트에 넣는다 — 문장 중간 줄바꿈과 인스타 줄은 저장되지 않는다(2026-11-28)", async () => {
    const { repo, real, exhibitorOf } = await setup();
    const x = exhibitorOf(real[0].id);
    await repo.upsertProfileField({
      subject: { exhibitorId: x },
      field: "intro",
      value: { original: "손으로 그릇을 빚습니다. 매일 물레를 돌립니다.\n인스타그램 @bowl.studio" },
      sources: ["https://fair.example/x"],
      status: "collected",
      actor: "system:brands-intake",
    });
    const r = await runBrandProfileDraft(repo, x, {
      convertTone: async () => "손으로 그릇을\n빚어요.\n매일 물레를 돌려요.\nInstagram @bowl.studio",
    });
    if ("error" in r) throw new Error(r.error);
    expect(r.gate).toEqual({ ok: true, issues: [] });
    const f = (await repo.listProfileFields({ exhibitorIds: [x] })).find((y) => y.field === "intro")!;
    expect(f.value).toMatchObject({
      original: "손으로 그릇을 빚습니다. 매일 물레를 돌립니다.\n인스타그램 @bowl.studio",
      display: "손으로 그릇을 빚어요.\n\n매일 물레를 돌려요.",
    });
  });

  it("소개가 게이트를 못 넘으면 짚은 점을 붙여 한 번만 더 쓴다", async () => {
    const convert = vi.fn<NonNullable<DraftDeps["convertTone"]>>(async ({ feedback }) => (feedback ? "그릇을 빚어요." : "그릇을 빚습니다."));
    const r = await rewriteIntro(convert, { original: "그릇을 빚습니다.", protectedTerms: [], brandName: "흙집" });
    expect(r).toMatchObject({ display: "그릇을 빚어요.", gate: { ok: true }, tries: 2 });
    expect(convert.mock.calls[0]![0]).toMatchObject({ brandName: "흙집", feedback: undefined });
    expect(convert.mock.calls[1]![0].feedback!.issues.some((i) => i.startsWith("해요체가 아닌 문장"))).toBe(true);
    // 두 번 다 못 넘어도 세 번째는 없다.
    const bad = vi.fn<NonNullable<DraftDeps["convertTone"]>>(async () => "그릇을 빚습니다.");
    expect((await rewriteIntro(bad, { original: "그릇을 빚습니다.", protectedTerms: [] })).gate.ok).toBe(false);
    expect(bad).toHaveBeenCalledTimes(2);
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

  it("LLM을 부르는 사이에 사람이 확인한 칸은 덮지 않는다(조건부 쓰기)", async () => {
    const { repo, real, exhibitorOf } = await setup();
    const x = exhibitorOf(real[0].id);
    const subject = { exhibitorId: x };
    const src = `roam:booth/${real[0].id}`;
    // 읽을 때 items는 AI 초안(워커가 써도 되는 칸), texture는 빈 칸이다.
    await repo.upsertProfileField({ subject, field: "items", value: ["엽서"], sources: [src], status: "ai_draft", actor: "worker:brand-profile-draft" });
    const r = await runBrandProfileDraft(repo, x, {
      draftFields: async () => {
        // LLM이 도는 동안 Ted가 items를 확인하고, texture를 직접 채운다.
        await repo.upsertProfileField({ subject, field: "items", value: ["포스터"], sources: [src], status: "reviewed", actor: "ted" });
        await repo.upsertProfileField({ subject, field: "texture", value: { tags: ["일상툰"] }, sources: [src], status: "reviewed", actor: "ted" });
        return {
          fields: [
            { field: "items", value: ["스티커"], sources: [src] },
            { field: "texture", value: { tags: ["동물 마스코트"] }, sources: [src] },
            { field: "signatureWorks", value: ["정원 엽서"], sources: [src] },
          ],
        };
      },
    });
    if ("error" in r) throw new Error(r.error);
    const fields = await repo.listProfileFields({ exhibitorIds: [x] });
    expect(fields.find((f) => f.field === "items")).toMatchObject({ status: "reviewed", value: ["포스터"], actor: "ted" });
    expect(fields.find((f) => f.field === "texture")).toMatchObject({ status: "reviewed", value: { tags: ["일상툰"] } });
    // 그사이 아무도 안 건드린 칸은 그대로 쓴다.
    expect(fields.find((f) => f.field === "signatureWorks")).toMatchObject({ status: "ai_draft", value: ["정원 엽서"] });
    expect(r.skipped).toEqual(
      expect.arrayContaining([
        { field: "items", reason: CHANGED_REASON },
        { field: "texture", reason: CHANGED_REASON },
      ]),
    );
    expect(r.written.map((w) => w.field)).not.toContain("items");
  });

  it("부스 없는 출전은 인입이 출처와 함께 모은 소개 원문을 자료로 쓰고, 출처가 그 URL만 가리킬 수 있다", async () => {
    const { repo } = await setup();
    const graph = (globalThis as unknown as { __roamStore: { exhibitorGraph: { exhibitors: unknown[]; participants: unknown[] } } }).__roamStore.exhibitorGraph;
    graph.exhibitors.push({ id: "ex_nb", canonicalName: "새해 공방" });
    graph.participants.push({ id: "pt_nb", exhibitorId: "ex_nb", exhibitionId: "exh_house_archive_2026", displayName: "새해 공방" });
    const official = "https://fair.example/brand/1";
    await repo.upsertProfileField({ subject: { exhibitorId: "ex_nb" }, field: "intro", value: { original: "손그림 엽서와 달력을 만듭니다." }, sources: [official], status: "collected", actor: "system:brands-intake" });
    const draftFields = vi.fn<NonNullable<DraftDeps["draftFields"]>>(async () => ({
      fields: [
        { field: "items", value: ["엽서"], sources: [official] },
        { field: "texture", value: { tags: ["일상툰"] }, sources: ["roam:booth/b_x"] }, // 자료에 없는 출처
      ],
    }));
    const r = await runBrandProfileDraft(repo, "ex_nb", { draftFields });
    if ("error" in r) throw new Error(r.error);
    expect(draftFields).toHaveBeenCalledTimes(1);
    expect(draftFields.mock.calls[0][0].prompt).toContain("손그림 엽서와 달력을 만듭니다.");
    const fields = await repo.listProfileFields({ exhibitorIds: ["ex_nb"] });
    expect(fields.find((f) => f.field === "items")).toMatchObject({ status: "ai_draft", sources: [official] });
    expect(fields.find((f) => f.field === "texture")).toBeUndefined();
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
    // 소개 지침(2026-11-28): 화자는 Roam, 연락처 빼기, 문단 2~3개와 빈 줄, 문단 안 줄바꿈 금지, 사실만.
    for (const w of ["화자는 Roam", "인스타그램 아이디", "링크", "해시태그", "이모지", "문단 2~3개", "빈 줄", "줄을 바꾸지 않는다", "원문에 적힌 사실만", "여러분"])
      expect(TONE_SYSTEM).toContain(w);
  });

  it("인스타와 판매 페이지는 읽지 않는다", () => {
    expect(mayFetch("https://www.instagram.com/heedagarden")).toBe(false);
    expect(mayFetch("https://smartstore.naver.com/abc")).toBe(false);
    expect(mayFetch("https://heedagarden.com/about")).toBe(true);
    expect(mayFetch("ftp://x")).toBe(false);
  });
});
