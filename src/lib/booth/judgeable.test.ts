import { describe, expect, it } from "vitest";
import { acceptsJudgment } from "@/lib/booth/judgeable";

describe("acceptsJudgment", () => {
  it("참가사 부스는 판단을 받는다", () => {
    expect(acceptsJudgment({ kind: "exhibitor" })).toBe(true);
  });

  // 라운지·카페테리아·센터 같은 편의시설. 여기 '끌림'을 눌러도 그 사람이 카페
  // 취향인 건 아니다 — 피드·추천이 이미 빼는 것을 지도·상세도 따라간다.
  it("편의시설은 판단을 받지 않는다", () => {
    expect(acceptsJudgment({ kind: "facility" })).toBe(false);
  });
});
