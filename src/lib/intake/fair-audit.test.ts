import { describe, expect, it } from "vitest";
import { auditFair } from "./fair-audit";
import { brandsFileSchema } from "./brands-schema";
import type { ExhibitorGraph } from "@/lib/types";

const brands = brandsFileSchema.parse({
  version: "brands.v1",
  exhibitionSlug: "moongu-2026-winter",
  source: { url: "https://example.com", collectedAt: "2026-11-10" },
  brands: [
    { key: "a", name: "Odd Tail", instagramUrl: "https://www.instagram.com/odd_tail/" },
    { key: "b", name: "구산", instagramUrl: "https://www.instagram.com/9san93/" },
    { key: "c", name: "없는곳이름" },
    { key: "d", name: "방랑민족" },
  ],
});
const graph: ExhibitorGraph = {
  exhibitors: [
    { id: "e1", canonicalName: "Odd Tail", instagramUrl: "https://instagram.com/odd_tail" },
    { id: "e2", canonicalName: "구산", instagramUrl: "https://instagram.com/9san93" },
    { id: "e3", canonicalName: "구산 스튜디오", instagramUrl: "https://instagram.com/9san93" },
    { id: "e4", canonicalName: "방랑민족" },
  ],
  participants: [
    { id: "p1", exhibitorId: "e1", exhibitionId: "x1", displayName: "Odd Tail" },
    { id: "p2", exhibitorId: "e4", exhibitionId: "x2", displayName: "방랑민족" },
  ],
  assignments: [],
  candidates: [],
};
const exhibitions = [
  { id: "x1", slug: "moongu-2026-winter", name: "문구전 2026 겨울", venue: "킨텍스 제2전시장 6홀", startDate: "2026-12-19", endDate: "2026-12-20" },
  { id: "x2", slug: "sif-2026", name: "서울일러스트레이션페어", venue: "코엑스", startDate: "2026-12-01", endDate: "2026-12-04" },
];

describe("auditFair", () => {
  const r = auditFair({
    exhibitions,
    match: ["moongu"],
    graph,
    fields: [{ id: "ex:e1:photos", exhibitorId: "e1", participantId: null, field: "photos", value: [{ path: "/a", scope: "s" }], sources: [], status: "reviewed", verifiedAt: "", actor: null, createdAt: "", updatedAt: "" }],
    boothCounts: { x1: 0 },
    floorplanSlugs: ["sif-2026"],
    brands,
    permissions: { p1: { status: "granted", allowedUse: ["sent-photo"] } },
  });

  it("후보 행사의 참가, 브랜드, 부스, 도면을 센다", () => {
    expect(r.fairs).toEqual([
      expect.objectContaining({ slug: "moongu-2026-winter", participants: 1, brands: 1, booths: 0, floorplan: false }),
    ]);
  });

  it("없는 브랜드, 중복, 이름만 같음을 가른다", () => {
    expect(r.summary).toMatchObject({ fileBrands: 4, found: 2, missing: ["c", "d"], duplicated: ["b"], nameOnly: ["d"], linkedToFair: 1 });
  });

  it("브랜드별 사진 칸과 허락을 싣는다", () => {
    const a = r.brands.find((b) => b.key === "a")!;
    expect(a).toMatchObject({ linkedFairs: ["moongu-2026-winter"], photoCount: 1, permissions: { p1: { status: "granted" } } });
    expect(r.brands.find((b) => b.key === "d")!.allFairs).toEqual([]);
  });
});
