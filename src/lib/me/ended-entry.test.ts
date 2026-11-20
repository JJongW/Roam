import { describe, expect, it } from "vitest";
import { daysBetween, needsVerdict, visitedLastWeek } from "./ended-entry";
import type { FairGroup } from "./view";

const group = (slug: string, endDate: string, ids: string[], phase: FairGroup["phase"] = "ended"): FairGroup => ({
  fair: { id: slug, slug, name: slug, venue: "", startDate: "2026-11-01", endDate },
  phase,
  rows: ids.map((boothId) => ({ boothId, name: boothId, exhibitionId: slug })),
});
const TODAY = "2026-11-20";

describe("끝난 박람회 입구", () => {
  it("daysBetween", () => {
    expect(daysBetween("2026-11-09", TODAY)).toBe(11);
  });

  it("평가 없는 곳이 있는 최근 박람회를 묻는다", () => {
    const g = needsVerdict(
      [group("old", "2026-11-01", ["a"]), group("recent", "2026-11-15", ["b"])],
      () => undefined,
      TODAY,
    );
    expect(g?.fair.slug).toBe("recent");
  });

  it("다 평가했거나 14일이 지났거나 나중에 하기로 한 곳은 묻지 않는다", () => {
    expect(needsVerdict([group("x", "2026-11-15", ["a"])], () => "good", TODAY)).toBeNull();
    expect(needsVerdict([group("x", "2026-10-01", ["a"])], () => undefined, TODAY)).toBeNull();
    expect(needsVerdict([group("x", "2026-11-15", ["a"])], () => undefined, TODAY, () => true)).toBeNull();
    expect(needsVerdict([group("x", "2026-11-25", ["a"], "ongoing")], () => undefined, TODAY)).toBeNull();
  });

  it("다녀오신 박람회는 끝나고 7일 안", () => {
    const list = visitedLastWeek([group("a", "2026-11-15", ["x"]), group("b", "2026-11-09", ["y"])], TODAY);
    expect(list.map((g) => g.fair.slug)).toEqual(["a"]);
  });
});
