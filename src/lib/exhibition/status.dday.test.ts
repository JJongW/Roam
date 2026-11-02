import { describe, expect, it } from "vitest";
import { daysUntilStart, exhibitionStatus } from "@/lib/exhibition/status";
import type { Exhibition } from "@/lib/types";

const ex = (startDate: string, endDate: string) =>
  ({ startDate, endDate }) as Exhibition;

describe("daysUntilStart", () => {
  it("남은 날을 센다", () => {
    expect(daysUntilStart("2026-06-20", "2026-06-10")).toBe(10);
    expect(daysUntilStart("2026-06-20", "2026-06-19")).toBe(1);
  });

  it("시작 당일과 그 이후는 0", () => {
    expect(daysUntilStart("2026-06-20", "2026-06-20")).toBe(0);
    expect(daysUntilStart("2026-06-20", "2026-07-01")).toBe(0);
  });

  it("달·해를 넘어가도 센다", () => {
    expect(daysUntilStart("2027-01-01", "2026-12-25")).toBe(7);
    expect(daysUntilStart("2026-03-01", "2026-02-28")).toBe(1);
  });

  it("상태 판정과 어긋나지 않는다 — D-0이면 더 이상 upcoming이 아니다", () => {
    const e = ex("2026-06-20", "2026-06-24");
    for (const today of ["2026-06-18", "2026-06-19", "2026-06-20", "2026-06-25"]) {
      const upcoming = exhibitionStatus(e, today) === "upcoming";
      expect(daysUntilStart(e.startDate, today) > 0).toBe(upcoming);
    }
  });
});
