import { describe, expect, it } from "vitest";
import { buildBrandDirectory, filterDirectory, groupDirectory, optionCounts } from "./directory";
import type { Booth, Category, Exhibition, ExhibitorGraph, ProfileField } from "@/lib/types";

const ex = (id: string, name: string, startDate: string) =>
  ({ id, name, startDate, slug: id, endDate: startDate }) as Exhibition;
const booth = (over: Partial<Booth> & { id: string; exhibitionId: string }): Booth =>
  ({
    hallId: "h",
    categoryId: "cat_a",
    name: over.id,
    company: "",
    description: "",
    longDescription: "",
    images: [],
    tags: [],
    x: 0,
    y: 0,
    popularity: 0,
    createdAt: "",
    ...over,
  }) as Booth;
const field = (exhibitorId: string, f: string, value: unknown, status: ProfileField["status"]): ProfileField => ({
  id: `ex:${exhibitorId}:${f}`,
  exhibitorId,
  participantId: null,
  field: f,
  value,
  sources: [],
  status,
  verifiedAt: "",
  actor: null,
  createdAt: "",
  updatedAt: "",
});

const exhibitions = [ex("e_old", "지난 페어", "2026-05-01"), ex("e_new", "이번 페어", "2026-11-01")];
const categories: Category[] = [{ id: "cat_a", slug: "a", name: "국내 작가", color: "", icon: "" }];
const booths = [
  booth({ id: "b1", exhibitionId: "e_old", name: "별빛", code: "A1" }),
  booth({ id: "b2", exhibitionId: "e_new", name: "별빛 공방", code: "B2" }),
  booth({ id: "b3", exhibitionId: "e_new", name: "달빛", code: "C3" }),
  booth({ id: "b4", exhibitionId: "e_new", name: "아직 안 이어짐" }),
  booth({ id: "f1", exhibitionId: "e_new", name: "라운지", kind: "facility" }),
];
const graph: ExhibitorGraph = {
  exhibitors: [
    { id: "x1", canonicalName: "별빛" },
    { id: "x2", canonicalName: "달빛" },
  ],
  participants: [
    { id: "p1", exhibitorId: "x1", exhibitionId: "e_old", displayName: "별빛" },
    { id: "p2", exhibitorId: "x1", exhibitionId: "e_new", displayName: "별빛 공방" },
    { id: "p3", exhibitorId: "x2", exhibitionId: "e_new", displayName: "달빛" },
  ],
  assignments: [
    { boothId: "b1", participantId: "p1", role: "primary" },
    { boothId: "b2", participantId: "p2", role: "primary" },
    { boothId: "b3", participantId: "p3", role: "primary" },
    { boothId: "b4", participantId: "p3", role: "co_exhibitor" },
  ],
  candidates: [],
};
const fields = [
  field("x1", "items", ["스티커", "엽서"], "reviewed"),
  field("x1", "texture", { tags: ["몽환 SF"] }, "ai_draft"),
  field("x1", "artistName", "별빛을담은밤", "collected"),
  field("x2", "items", ["키링"], "stale"),
];

describe("buildBrandDirectory", () => {
  const { brands, unlinked } = buildBrandDirectory({ exhibitions, booths, categories, graph, fields });

  it("브랜드 하나에 출전을 모으고, 대표 배정이 없는 부스는 따로 둔다", () => {
    expect(brands.map((b) => b.exhibitorId)).toEqual(["x2", "x1"]); // 가나다순
    const x1 = brands.find((b) => b.exhibitorId === "x1")!;
    expect(x1.appearances.map((a) => a.boothId)).toEqual(["b2", "b1"]);
    expect(x1.appearances[0].participantId).toBe("p2");
    expect(unlinked.map((a) => a.boothId)).toEqual(["b4"]); // 공동 출전은 그 부스의 브랜드가 아니다, 시설은 빠진다
  });

  it("프로필 칸에서 품목, 결 태그, 작가명, 채움 정도를 읽는다", () => {
    const x1 = brands.find((b) => b.exhibitorId === "x1")!;
    expect(x1).toMatchObject({ artistName: "별빛을담은밤", items: ["스티커", "엽서"], textureTags: ["몽환 SF"] });
    expect(x1.fill).toMatchObject({ confirmed: 2, aiDraft: 1, stale: 0 });
    expect(x1.fillLevel).toBe("partial");
    expect(brands.find((b) => b.exhibitorId === "x2")!.fillLevel).toBe("empty");
  });

  it("거르기: 박람회, 출전 횟수, 품목, 결, 채움, 확인 필요, 이름(작가명 포함)", () => {
    expect(filterDirectory(brands, { exhibitionId: "e_old" }).map((b) => [b.exhibitorId, b.appearances.length])).toEqual([["x1", 1]]);
    expect(filterDirectory(brands, { minAppearances: 2 }).map((b) => b.exhibitorId)).toEqual(["x1"]);
    expect(filterDirectory(brands, { item: "키링" }).map((b) => b.exhibitorId)).toEqual(["x2"]);
    expect(filterDirectory(brands, { texture: "몽환 SF" }).map((b) => b.exhibitorId)).toEqual(["x1"]);
    expect(filterDirectory(brands, { fill: "empty" }).map((b) => b.exhibitorId)).toEqual(["x2"]);
    expect(filterDirectory(brands, { needsReview: true })).toHaveLength(2);
    expect(filterDirectory(brands, { q: "담은밤" }).map((b) => b.exhibitorId)).toEqual(["x1"]);
  });

  it("묶어 보기와 필터 보기 개수", () => {
    expect(groupDirectory(brands, "item").map((g) => [g.label, g.rows.length])).toEqual([
      ["스티커", 1],
      ["엽서", 1],
      ["키링", 1],
    ]);
    expect(groupDirectory(brands, "exhibition").map((g) => [g.label, g.rows.length])).toEqual([
      ["이번 페어", 2],
      ["지난 페어", 1],
    ]);
    expect(groupDirectory(brands, "texture").at(-1)!.label).toBe("결 태그 없음");
    expect(optionCounts(brands, (b) => b.items)[0]).toMatchObject({ count: 1 });
  });
});
