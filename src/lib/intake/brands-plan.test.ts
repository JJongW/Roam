import { describe, expect, it } from "vitest";
import { brandScopeKey, planBrands, type BrandsPlanInput } from "./brands-plan";
import { brandsFileSchema, type BrandsFile } from "./brands-schema";
import { intakeAnyRequestSchema } from "./schema";
import { brandKeyIdentity } from "@/lib/exhibitor/identity";
import { candidateKeys } from "@/lib/exhibitor/plan";
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

describe("planBrands 참가 단위 연결 후보(0073, 2026-11-20 Ted 결정)", () => {
  // 새해 준비상점(부스 0) ny-311 네츄럴굿띵스 ↔ 하우스 아카이브의 기존 브랜드(인스타 ngt_kr).
  const ngtGraph: ExhibitorGraph = {
    ...emptyGraph,
    exhibitors: [{ id: "exr_ngt", canonicalName: "네츄럴굿띵스", instagramUrl: "https://instagram.com/ngt_kr" }],
    participants: [{ id: "pt_house", exhibitorId: "exr_ngt", exhibitionId: "exh_house", displayName: "네츄럴굿띵스" }],
  };
  const ngtExisting = [{ id: "exr_ngt", keys: ["instagram.com/ngt_kr"], names: ["네츄럴굿띵스"] }];
  const ngt = file([{ key: "ny-311", name: "네츄럴굿띵스", aliases: ["NGT"] }]);

  it("이름만 같으면 새 브랜드와 참가를 만들고, 그 참가를 부스 없이 후보로 올린다", () => {
    const plan = run({ file: ngt, graph: ngtGraph, existing: ngtExisting });
    expect(plan.summary).toMatchObject({ newBrands: 1, participantsToCreate: 1, candidates: 1 });
    const pk = plan.exhibitorPlan.participants[0].key;
    expect(plan.exhibitorPlan.candidates).toEqual([
      { participantRef: { new: pk }, target: { existing: "exr_ngt" }, reason: '이름이 같아요: "네츄럴굿띵스"' },
    ]);
    expect(plan.exhibitorPlan.candidates[0]).not.toHaveProperty("boothId");
    expect(plan.exhibitorPlan.assignments).toEqual([]);
    expect(plan.nameMatches).toEqual([{ key: "ny-311", name: "네츄럴굿띵스", existing: [{ id: "exr_ngt", name: "네츄럴굿띵스" }] }]);
  });

  it("다른 이름(영문 이름)만 같아도 후보가 된다", () => {
    const plan = run({
      file: file([{ key: "ny-311", name: "네츄럴 굿 띵스 스튜디오", aliases: ["NGT Studio"] }]),
      graph: { ...ngtGraph, exhibitors: [{ ...ngtGraph.exhibitors[0], aliases: ["NGT Studio"] }] },
      existing: [{ ...ngtExisting[0], names: ["네츄럴굿띵스", "NGT Studio"] }],
    });
    expect(plan.exhibitorPlan.candidates).toEqual([
      expect.objectContaining({ target: { existing: "exr_ngt" }, reason: '이름이 같아요: "NGT Studio"' }),
    ]);
  });

  it("#192가 먼저 올라간 뒤 다시 올려도(파일 키로 찾음) 있는 참가로 후보를 낸다", () => {
    const keyed: ExhibitorGraph = {
      ...ngtGraph,
      exhibitors: [...ngtGraph.exhibitors, { id: "exr_ny311", canonicalName: "네츄럴굿띵스", aliases: ["NGT"], brandKeys: [brandScopeKey(ngt, "ny-311")] }],
      participants: [...ngtGraph.participants, { id: "pt_ny311", exhibitorId: "exr_ny311", exhibitionId: "exh_ny", displayName: "네츄럴굿띵스" }],
    };
    const existing = [
      ...ngtExisting,
      { id: "exr_ny311", keys: [brandKeyIdentity(brandScopeKey(ngt, "ny-311"))], names: ["네츄럴굿띵스", "NGT"] },
    ];
    const plan = run({ file: ngt, graph: keyed, existing });
    expect(plan.brands[0]).toMatchObject({ matchedBy: "brandKey", participant: "exists" });
    expect(plan.exhibitorPlan.exhibitors).toEqual([]);
    expect(plan.exhibitorPlan.participants).toEqual([]);
    expect(plan.exhibitorPlan.candidates).toEqual([
      { participantRef: { existing: "pt_ny311" }, target: { existing: "exr_ngt" }, reason: '이름이 같아요: "네츄럴굿띵스"' },
    ]);
    // 이미 낸 짝(대기든 반려든)은 다시 내지 않는다.
    const again = run({
      file: ngt,
      graph: keyed,
      existing,
      decidedCandidates: candidateKeys([{ boothId: null, participantId: "pt_ny311", exhibitorId: "exr_ngt" }]),
    });
    expect(again.exhibitorPlan.candidates).toEqual([]);
  });

  it("인스타가 맞거나 사람이 id를 적었으면 후보를 내지 않는다", () => {
    const byIg = run({ file: file([{ key: "ny-311", name: "네츄럴굿띵스", instagramUrl: "https://instagram.com/ngt_kr" }]), graph: ngtGraph, existing: ngtExisting });
    expect(byIg.brands[0].matchedBy).toBe("identity");
    expect(byIg.exhibitorPlan.candidates).toEqual([]);
    const explicit = run({ file: file([{ key: "ny-311", name: "네츄럴굿띵스", exhibitorId: "exr_ngt" }]), graph: ngtGraph, existing: ngtExisting });
    expect(explicit.exhibitorPlan.candidates).toEqual([]);
  });

  it("행사가 없는 파일은 참가가 없어 후보 대신 '이름 같은 기존 브랜드'로만 보여 준다", () => {
    const plan = run({ file: file([{ key: "ny-311", name: "네츄럴굿띵스" }], null), exhibitionId: null, graph: ngtGraph, existing: ngtExisting });
    expect(plan.exhibitorPlan.candidates).toEqual([]);
    expect(plan.nameMatches).toHaveLength(1);
  });
});

describe("planBrands 참가 구분", () => {
  it("participationType은 참가 사실 metadata에만 남는다", () => {
    const plan = run({
      file: file([{ key: "yuk", name: "육주영", category: "그래픽 컬처", participationType: "영 디자이너 프로모션" }]),
    });
    expect(plan.exhibitorPlan.participants[0].metadata).toMatchObject({
      brandKey: "yuk",
      category: "그래픽 컬처",
      participationType: "영 디자이너 프로모션",
    });
    expect(plan.exhibitorPlan.exhibitors[0].metadata).not.toHaveProperty("participationType");
  });
});
