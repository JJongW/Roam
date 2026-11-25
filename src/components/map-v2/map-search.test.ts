import { describe, expect, it } from "vitest";
import type { BoothListItem } from "@/lib/types";
import { isCardResult, searchMapBooths } from "./map-search";

const booth = (p: Partial<BoothListItem> & { id: string; name: string }): BoothListItem =>
  ({ code: p.id, kind: "exhibitor", ...p }) as BoothListItem;

const booths = [
  booth({ id: "A-05", name: "SDF Stage", kind: "facility" }),
  booth({ id: "B-01", name: "헤즈", company: "Stage Lab", aliases: ["HEDS"] }),
  booth({ id: "C-13", name: "SDF SHOP", kind: "facility" }),
];

// iOS FairMapModel.search, FairMapViewModel.cardResults와 같다(2026-11-24 P1-2).
describe("지도 찾기", () => {
  it("시설 칸도 검색 결과에 나온다", () => {
    expect(searchMapBooths(booths, "stage").map((b) => b.id)).toEqual(["A-05", "B-01"]);
    expect(searchMapBooths(booths, "SDF").map((b) => b.id)).toEqual(["A-05", "C-13"]);
  });

  it("부스 번호와 다른 이름으로도 찾고, 빈 검색은 결과가 없다", () => {
    expect(searchMapBooths(booths, "a-05").map((b) => b.id)).toEqual(["A-05"]);
    expect(searchMapBooths(booths, "heds").map((b) => b.id)).toEqual(["B-01"]);
    expect(searchMapBooths(booths, "  ")).toEqual([]);
  });

  it("시설 칸은 부스 카드가 없고 부스 수에 들지 않는다", () => {
    const results = searchMapBooths(booths, "stage");
    expect(results.filter(isCardResult).map((b) => b.id)).toEqual(["B-01"]);
  });
});
