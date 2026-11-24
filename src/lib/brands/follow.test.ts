import { describe, expect, it } from "vitest";
import { planBrandHeartBackfill } from "./follow";

describe("planBrandHeartBackfill(UI 23 채우기)", () => {
  it("하트인 부스의 대표 브랜드마다 한 줄, 이미 있는 줄과 브랜드 없는 부스는 건너뛴다", () => {
    const plan = planBrandHeartBackfill({
      heartedNotes: [
        { userId: "u1", boothId: "a1" },
        { userId: "u1", boothId: "a2" }, // 같은 브랜드 → 한 줄로
        { userId: "u1", boothId: "b1" }, // 이미 직접 하트
        { userId: "u2", boothId: "a1" },
        { userId: "u2", boothId: "none" }, // 대표 브랜드 없음
      ],
      links: { a1: { exhibitorId: "ex1" }, a2: { exhibitorId: "ex1" }, b1: { exhibitorId: "ex2" } },
      existing: [{ userId: "u1", exhibitorId: "ex2" }],
    });
    expect(plan).toEqual([
      { userId: "u1", exhibitorId: "ex1", boothIds: ["a1", "a2"] },
      { userId: "u2", exhibitorId: "ex1", boothIds: ["a1"] },
    ]);
  });
});
