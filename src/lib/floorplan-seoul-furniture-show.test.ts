import { describe, expect, it } from "vitest";
import { FLOORPLANS } from "@/lib/floorplans";
import intake from "../../data/intake/seoul-furniture-show-2026.json";

describe("서울가구쇼 2026 도면", () => {
  const fp = FLOORPLANS["seoul-furniture-show-2026"];
  it("공식 배치도의 부스 104개, 번호 중복 없음", () => {
    expect(fp.booths).toHaveLength(104);
    expect(new Set(fp.booths.map((b) => b.code)).size).toBe(104);
  });
  it("인입 파일의 모든 부스가 도면에 있다", () => {
    const codes = new Set(fp.booths.map((b) => b.code));
    expect(intake.booths.filter((b) => !codes.has(b.code))).toEqual([]);
  });
});
