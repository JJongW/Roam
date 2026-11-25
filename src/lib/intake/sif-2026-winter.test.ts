import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getRepository } from "@/lib/repositories";
import { exhibitionInputSchema } from "@/lib/schemas";
import { planFromRepository } from "@/lib/exhibitor/service";
import { flatName } from "@/lib/exhibitor/identity";
import { brandsFileSchema } from "./brands-schema";
import { applyBrandsPlan, planBrandsFromRepository } from "./brands-apply";

// 방문객 요청으로 본다(로컬과 테스트에선 운영자 게이트가 꺼져 있어 isAdminAuthed가 true다).
vi.mock("@/lib/api/http", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/http")>()),
  isAdminAuthed: async () => false,
}));
import { GET as listExhibitions } from "@/app/api/exhibitions/route";

// 서울일러스트레이션페어V.22 브랜드 먼저(2026-11-20 Ted "브랜드 먼저 넣어")를 mock에서 끝까지 돌린다.
// 운영과 같은 순서: V.21 부스로 브랜드 그래프 백필(운영은 0063) → 행사 행 → brands.v1 미리보기 → 적용 → 다시 돌림.
const read = (p: string) => JSON.parse(readFileSync(join(process.cwd(), p), "utf8"));
const file = brandsFileSchema.parse(read("data/brands/sif-2026-winter.json"));
const exhibitionRow = exhibitionInputSchema.parse(read("data/exhibitions/sif-2026-winter.json"));

beforeEach(() => {
  (globalThis as unknown as { __roamStore?: unknown }).__roamStore = undefined;
});

describe("서울일러스트레이션페어V.22 브랜드 먼저(mock)", () => {
  it("V.21 브랜드는 인스타나 웹으로 잇고, 새 참가는 새로 만들고, 목록엔 흐린 진행 예정으로 나온다", async () => {
    const repo = await getRepository();
    const { plan: backfill } = await planFromRepository(repo);
    await repo.applyExhibitorPlan(backfill);
    const v21 = await repo.getExhibitionIdBySlug("sif-2026");
    const before = await repo.loadExhibitorGraph();

    const ex = await repo.createExhibition(exhibitionRow);
    const res = await planBrandsFromRepository(repo, file);
    if (!res.ok) throw new Error(res.message);
    const s = res.plan.summary;
    expect(res.plan.errors).toEqual([]);
    // V.21 링크를 적은 곳은 운영과 같은 판정(identity)으로 V.21 브랜드에 이어진다.
    const linked = res.plan.brands.filter((b) => b.matchedBy === "identity");
    expect(linked.length).toBe(s.linkedBrands);
    const v21Exhibitors = new Set(before.participants.filter((p) => p.exhibitionId === v21).map((p) => p.exhibitorId));
    for (const b of linked) expect(v21Exhibitors.has((b.target as { existing: string }).existing)).toBe(true);
    // 이어진 V.21 브랜드 이름이 V.22 이름과 같다(링크 모음 주소로 남의 브랜드에 붙지 않았다).
    // 비슷한 이름(모로하나베이커리 ↔ 모로하나)은 V.21 표기를 aliases로 적었으니 그 표기와 같으면 된다.
    const namesOf = (key: string) => {
      const f = file.brands.find((x) => x.key === key)!;
      return [f.name, ...(f.aliases ?? [])].map(flatName);
    };
    expect(linked.filter((b) => !namesOf(b.key).includes(flatName(b.existingName ?? ""))).map((b) => `${b.name} → ${b.existingName}`)).toEqual([]);
    // 파일 안에 이름이 같은 항목은 프로필 대조로 다른 작가라고 가른 것(키에 프로필 id)뿐이다.
    const dupNames = file.brands.filter((b, i) => file.brands.findIndex((x) => flatName(x.name) === flatName(b.name)) !== i);
    for (const b of dupNames) expect(b.key).toMatch(/^sif22-.+-[0-9a-f]{24}$/);
    // 그 짝은 브랜드도 따로다(같은 이름으로 합쳐지지 않는다).
    for (const b of dupNames) expect(res.plan.brands.find((x) => x.keys.includes(b.key))?.keys).toEqual([b.key]);
    expect(s.newBrands + s.linkedBrands + s.mergedInFile).toBe(file.brands.length);
    expect(s.participantsToCreate).toBe(file.brands.length - s.mergedInFile);

    const applied = await applyBrandsPlan(repo, res.plan, { actor: "test", source: "intake" } as Parameters<typeof applyBrandsPlan>[2]);
    expect(applied.failures).toEqual([]);
    expect(applied.createdBrands).toBe(s.newBrands);
    expect(applied.createdParticipants).toBe(s.participantsToCreate);

    const after = await repo.loadExhibitorGraph();
    const mine = after.participants.filter((p) => p.exhibitionId === ex.id);
    expect(mine.length).toBe(s.participantsToCreate);
    // 중복 0: 한 브랜드에 이 행사 참가는 하나, 새로 생긴 브랜드는 새 브랜드 수와 같다.
    expect(new Set(mine.map((p) => p.exhibitorId)).size).toBe(mine.length);
    expect(after.exhibitors.length - before.exhibitors.length).toBe(s.newBrands);
    // 부스는 없다.
    expect((await repo.listBoothsFull(ex.id)).length).toBe(0);

    // 다시 돌려도 새로 만들 것이 없다(brandKeys로 찾는다).
    const again = await planBrandsFromRepository(repo, file);
    if (!again.ok) throw new Error(again.message);
    expect(again.plan.summary.newBrands).toBe(0);
    expect(again.plan.summary.participantsToCreate).toBe(0);

    // 방문객 목록: 나오되 열 수 없다(흐린 "진행 예정").
    const body = (await (await listExhibitions(new Request("http://localhost/api/exhibitions?limit=200"))).json()) as {
      data: { data: { slug: string; openable: boolean; availability: string }[] };
    };
    const row = body.data.data.find((e) => e.slug === "sif-2026-winter");
    expect(row).toMatchObject({ openable: false, availability: "upcoming_no_map" });

    console.log(
      `[sif-2026-winter mock] 파일 ${file.brands.length}곳 → 새 브랜드 ${s.newBrands}, V.21에 이음 ${s.linkedBrands}, 파일 안 묶음 ${s.mergedInFile}, ` +
        `참가 ${mine.length}, 이름만 같음 ${res.plan.nameMatches.length}, 연결 후보 ${s.candidates}, 채운 칸 ${applied.filledFields}`,
    );
  }, 60_000);
});
