import { describe, expect, it } from "vitest";
import { calibration } from "./calibration";
import type { EnrichmentCandidate } from "@/lib/types";

function cand(
  confidence: number,
  status: EnrichmentCandidate["status"],
): EnrichmentCandidate {
  return {
    id: `c${Math.random()}`, boothId: "b", exhibitionId: "e", source: "drafter",
    payload: {}, sources: [], confidence, issues: [], status,
    createdAt: "2026-01-01T00:00:00Z",
  };
}

const many = (n: number, c: number, s: EnrichmentCandidate["status"]) =>
  Array.from({ length: n }, () => cand(c, s));

describe("calibration", () => {
  it("사람이 판단한 것만 근거로 센다", () => {
    const cal = calibration([
      cand(0.9, "approved"),
      cand(0.9, "pending"),
      cand(0.9, "superseded"),
    ]);
    expect(cal.reviewed).toBe(1);
    expect(cal.bands[0].approved).toBe(1);
  });

  it("밴드별 승인률을 낸다", () => {
    const cal = calibration([
      ...many(22, 0.9, "approved"),
      cand(0.9, "rejected"),
      ...many(3, 0.7, "approved"),
      ...many(3, 0.4, "approved"),
      cand(0.4, "rejected"),
    ]);
    expect(cal.bands[0].approvalPct).toBe(96);
    expect(cal.bands[1].approvalPct).toBe(100);
    expect(cal.bands[2].approvalPct).toBe(75);
  });

  it("표본이 적으면 임계값 근거로 쓰지 말라고 한다", () => {
    const cal = calibration(many(5, 0.9, "approved"));
    expect(cal.note).toContain("표본이 5건뿐");
  });

  it("상단 승인률이 낮으면 경고한다", () => {
    const cal = calibration([
      ...many(15, 0.9, "approved"),
      ...many(10, 0.9, "rejected"),
    ]);
    expect(cal.note).toContain("검수 없이 나간다");
  });

  it("하단도 많이 승인되면 재조사로 돌리지 말라고 짚는다", () => {
    // 운영에서 실제로 이 상태였다 — <0.60이 75% 승인.
    const cal = calibration([
      ...many(22, 0.9, "approved"),
      cand(0.9, "rejected"),
      ...many(3, 0.4, "approved"),
      cand(0.4, "rejected"),
    ]);
    expect(cal.note).toContain("확인 불가");
    expect(cal.note).toContain("쓸 만한 초안을 버린다");
  });

  it("판단된 게 없으면 자동 통과를 켜지 말라고 한다", () => {
    expect(calibration([cand(0.9, "pending")]).note).toContain("근거가 생긴 뒤에");
  });
});
