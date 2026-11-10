import { describe, expect, it } from "vitest";
import { brandScopeKey, planBrands, type BrandsPlanInput } from "./brands-plan";
import { brandsFileSchema, type BrandsFile } from "./brands-schema";
import { intakeAnyRequestSchema } from "./schema";
import { brandKeyIdentity } from "@/lib/exhibitor/identity";
import type { ExhibitorGraph } from "@/lib/types";

const SRC = { url: "https://newyear-store.example/brands", collectedAt: "2026-11-10" };
const file = (brands: BrandsFile["brands"], exhibitionSlug: string | null = "newyear-store-2026"): BrandsFile => ({
  version: "brands.v1",
  exhibitionSlug,
  source: SRC,
  brands,
});
const emptyGraph: ExhibitorGraph = { exhibitors: [], participants: [], assignments: [], candidates: [] };
const run = (over: Partial<BrandsPlanInput> & { file: BrandsFile }) =>
  planBrands({ exhibitionId: "exh_ny", graph: emptyGraph, existing: [], ...over });

describe("brands.v1 형식", () => {
  it("key가 파일 안에서 겹치면 받지 않는다", () => {
    const r = brandsFileSchema.safeParse(file([{ key: "a", name: "가" }, { key: "a", name: "나" }]));
    expect(r.success).toBe(false);
  });

  it("intro는 4000자까지, 상태는 collected와 artist_confirmed만", () => {
    const ok = brandsFileSchema.safeParse(file([{ key: "a", name: "가", intro: { text: "소개", status: "collected", source: SRC.url } }]));
    expect(ok.success).toBe(true);
    const long = brandsFileSchema.safeParse(file([{ key: "a", name: "가", intro: { text: "가".repeat(4001), status: "collected", source: SRC.url } }]));
    expect(long.success).toBe(false);
    const status = brandsFileSchema.safeParse({ ...file([]), brands: [{ key: "a", name: "가", intro: { text: "x", status: "reviewed", source: "s" } }] });
    expect(status.success).toBe(false);
  });

  it("/admin/intake 요청은 version으로 intake.v1과 brands.v1을 가른다", () => {
    const b = intakeAnyRequestSchema.parse({ file: file([{ key: "a", name: "가" }]) });
    expect(b.file.version).toBe("brands.v1");
    const i = intakeAnyRequestSchema.parse({ file: { version: 1, exhibitionSlug: "x", booths: [{ code: "A1" }] } });
    expect(i.file.version).toBe(1);
  });
});

describe("planBrands", () => {
  it("새 브랜드와 참가 사실, 빈 칸 셋(intro, links, photos)을 계획한다", () => {
    const plan = run({
      file: file([
        {
          key: "hachi",
          name: "하치",
          company: "하치 주식회사",
          aliases: ["HACHI"],
          instagramUrl: "https://instagram.com/hachi",
          websiteUrl: "https://hachi.example.com",
          intro: { text: "하치는 단청 문양을 담는 스튜디오입니다.", status: "collected", source: "https://newyear-store.example/hachi" },
          photos: [{ path: "newyear-store-2026/hachi.webp", scope: "카드뉴스, 앱" }],
          category: "새해 문구전",
        },
      ]),
    });
    expect(plan.summary).toMatchObject({ newBrands: 1, linkedBrands: 0, participantsToCreate: 1, fieldsToFill: 3 });
    expect(plan.exhibitorPlan.exhibitors).toEqual([
      {
        key: "new:hachi",
        canonicalName: "하치",
        instagramUrl: "https://instagram.com/hachi",
        websiteUrl: "https://hachi.example.com",
        legalName: "하치 주식회사",
        aliases: ["HACHI"],
        metadata: { brandKeys: [brandScopeKey(file([]), "hachi")], source: SRC },
      },
    ]);
    expect(plan.exhibitorPlan.participants).toEqual([
      {
        key: "new:hachi|exh_ny",
        exhibitorRef: { new: "new:hachi" },
        exhibitionId: "exh_ny",
        displayName: "하치",
        aliases: ["HACHI"],
        sourceUrls: [SRC.url],
        metadata: { brandKey: "hachi", category: "새해 문구전", source: SRC },
      },
    ]);
    expect(plan.exhibitorPlan.assignments).toEqual([]);
    const byField = Object.fromEntries(plan.fields.map((f) => [f.field, f]));
    expect(byField.intro).toMatchObject({
      value: { original: "하치는 단청 문양을 담는 스튜디오입니다." },
      status: "collected",
      sources: ["https://newyear-store.example/hachi"],
    });
    expect(byField.links).toMatchObject({
      value: [
        { kind: "instagram", url: "https://instagram.com/hachi" },
        { kind: "site", url: "https://hachi.example.com" },
      ],
      status: "collected",
      sources: [SRC.url],
    });
    expect(byField.photos.value).toEqual([{ path: "newyear-store-2026/hachi.webp", scope: "카드뉴스, 앱" }]);
  });

  it("행사가 없으면(null) 참가 사실 없이 브랜드만", () => {
    const plan = run({ file: file([{ key: "a", name: "가나다" }], null), exhibitionId: null });
    expect(plan.exhibitorPlan.participants).toEqual([]);
    expect(plan.brands[0].participant).toBe("none");
    expect(plan.exhibitorPlan.exhibitors[0].metadata).toMatchObject({ brandKeys: [`brands.v1:${SRC.url}#a`] });
  });

  it("인스타가 기존 브랜드와 겹치면 그 브랜드를 쓰고, 이미 있는 칸은 건드리지 않는다", () => {
    const plan = run({
      file: file([{ key: "a", name: "하치 스튜디오", instagramUrl: "https://www.instagram.com/hachi/", intro: { text: "소개", status: "collected", source: "s" } }]),
      graph: { ...emptyGraph, exhibitors: [{ id: "ex1", canonicalName: "하치" }] },
      existing: [{ id: "ex1", keys: ["instagram.com/hachi"], names: ["하치"] }],
      filledFields: new Map([["ex1", new Set(["intro"])]]),
    });
    expect(plan.exhibitorPlan.exhibitors).toEqual([]);
    expect(plan.brands[0]).toMatchObject({ target: { existing: "ex1" }, existingName: "하치", matchedBy: "identity", kept: ["intro"] });
    expect(plan.fields.map((f) => f.field)).toEqual(["links"]);
    expect(plan.exhibitorPlan.participants[0].exhibitorRef).toEqual({ existing: "ex1" });
    expect(plan.nameMatches).toEqual([]);
  });

  it("이름만 같으면 합치지 않고 새로 만들며 '이름 같은 기존 브랜드'로 보여 준다", () => {
    const plan = run({
      file: file([{ key: "a", name: "메멜트" }]),
      graph: { ...emptyGraph, exhibitors: [{ id: "ex1", canonicalName: "메멜트" }] },
      existing: [{ id: "ex1", keys: [], names: ["메멜트"] }],
    });
    expect(plan.exhibitorPlan.exhibitors).toHaveLength(1);
    expect(plan.nameMatches).toEqual([{ key: "a", name: "메멜트", existing: [{ id: "ex1", name: "메멜트" }] }]);
  });

  it("사람이 적은 exhibitorId가 있으면 그 기존 브랜드에 잇는다", () => {
    const plan = run({
      file: file([{ key: "a", name: "메멜트 MEMELT", exhibitorId: "ex1" }]),
      graph: { ...emptyGraph, exhibitors: [{ id: "ex1", canonicalName: "메멜트" }] },
      existing: [{ id: "ex1", keys: [], names: ["메멜트"] }],
    });
    expect(plan.exhibitorPlan.exhibitors).toEqual([]);
    expect(plan.brands[0]).toMatchObject({ target: { existing: "ex1" }, matchedBy: "explicit" });
    expect(plan.nameMatches).toEqual([]);
    expect(plan.summary.linkedBrands).toBe(1);
  });

  it("exhibitorId가 없는 브랜드거나 인스타가 다른 브랜드를 가리키면 오류", () => {
    const graph = { ...emptyGraph, exhibitors: [{ id: "ex1", canonicalName: "메멜트" }, { id: "ex2", canonicalName: "하치" }] };
    const existing = [
      { id: "ex1", keys: [], names: ["메멜트"] },
      { id: "ex2", keys: ["instagram.com/hachi"], names: ["하치"] },
    ];
    const missing = run({ file: file([{ key: "a", name: "메멜트", exhibitorId: "nope" }]), graph, existing });
    expect(missing.errors[0].message).toContain("맞는 기존 브랜드가 없어요");
    const clash = run({
      file: file([{ key: "a", name: "메멜트", exhibitorId: "ex1", instagramUrl: "https://instagram.com/hachi" }]),
      graph,
      existing,
    });
    expect(clash.errors[0].message).toContain("달라요");
    expect(clash.brands).toEqual([]);
  });

  it("파일 안에서 같은 인스타는 하나로 묶는다", () => {
    const plan = run({
      file: file([
        { key: "a", name: "하치", instagramUrl: "https://instagram.com/hachi" },
        { key: "b", name: "하치 굿즈", instagramUrl: "https://instagram.com/hachi/", photos: [{ path: "p.webp", scope: "앱" }] },
      ]),
    });
    expect(plan.summary).toMatchObject({ newBrands: 1, mergedInFile: 1, participantsToCreate: 1 });
    expect(plan.brands[0]).toMatchObject({ key: "a", keys: ["a", "b"], name: "하치" });
    expect(plan.exhibitorPlan.exhibitors[0].aliases).toEqual(["하치 굿즈"]);
    expect(plan.exhibitorPlan.participants[0].metadata).toMatchObject({ brandKey: "a", brandKeys: ["a", "b"] });
    expect(plan.fields.map((f) => f.field).sort()).toEqual(["links", "photos"]);
  });

  it("다시 돌리면 파일 키로 같은 브랜드를 찾고, 참가 사실과 채운 칸은 건너뛴다(멱등)", () => {
    const f = file([{ key: "a", name: "가나다", intro: { text: "소개", status: "collected", source: "s" } }]);
    const plan = run({
      file: f,
      graph: {
        ...emptyGraph,
        exhibitors: [{ id: "ex1", canonicalName: "가나다", brandKeys: [brandScopeKey(f, "a")] }],
        participants: [{ id: "pt1", exhibitorId: "ex1", exhibitionId: "exh_ny", displayName: "가나다" }],
      },
      existing: [{ id: "ex1", keys: [brandKeyIdentity(brandScopeKey(f, "a"))], names: ["가나다"] }],
      filledFields: new Map([["ex1", new Set(["intro"])]]),
    });
    expect(plan.brands[0]).toMatchObject({ matchedBy: "brandKey", participant: "exists" });
    expect(plan.exhibitorPlan).toEqual({ exhibitors: [], participants: [], assignments: [], candidates: [] });
    expect(plan.fields).toEqual([]);
    expect(plan.nameMatches).toEqual([]);
  });

  it("인스타와 도메인이 서로 다른 기존 브랜드에 맞으면 고르지 않고 오류로 돌려준다", () => {
    const plan = run({
      file: file([{ key: "a", name: "가나다", instagramUrl: "https://instagram.com/aaa", websiteUrl: "https://bbbbb.com" }]),
      existing: [
        { id: "ex1", keys: ["instagram.com/aaa"], names: [] },
        { id: "ex2", keys: ["bbbbb"], names: [] },
      ],
    });
    expect(plan.errors).toHaveLength(1);
    expect(plan.brands).toEqual([]);
    expect(plan.exhibitorPlan.exhibitors).toEqual([]);
  });

  it("값 모양이 칸 정의에 안 맞으면 그 칸만 건너뛰고 경고한다", () => {
    const plan = run({ file: file([{ key: "a", name: "가나다", photos: [{ path: "x".repeat(1000), scope: "앱" }] }]) });
    expect(plan.fields.map((f) => f.field)).toEqual(["photos"]);
    const bad = run({ file: { ...file([]), brands: [{ key: "a", name: "가나다", photos: [{ path: "p", scope: "" }] }] } as BrandsFile });
    expect(bad.fields).toEqual([]);
    expect(bad.warnings.some((w) => w.includes("photos"))).toBe(true);
  });
});
