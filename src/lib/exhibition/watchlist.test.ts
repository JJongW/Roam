import { describe, expect, it } from "vitest";
import {
  listActiveRecurringExhibitionWatchlist,
  RECURRING_EXHIBITION_WATCHLIST,
  type RecurringExhibitionWatchlistItem,
} from "./watchlist";

function hasVenue(
  item: RecurringExhibitionWatchlistItem,
  venue: "coex-samseong" | "coex-magok",
) {
  return item.venues.includes(venue);
}

describe("recurring exhibition watchlist", () => {
  it("contains the curated COEX and COEX Magok monitoring targets", () => {
    expect(RECURRING_EXHIBITION_WATCHLIST).toHaveLength(15);
    expect(listActiveRecurringExhibitionWatchlist()).toHaveLength(15);
  });

  it("keeps explicitly excluded shows out of the monitoring database", () => {
    const text = RECURRING_EXHIBITION_WATCHLIST.map(
      (item) => `${item.name} ${item.slug}`,
    ).join("\n");

    expect(text).not.toMatch(/웨딩|wedex|wedding/i);
    expect(text).not.toMatch(/KOREA KIDS FAIR|korea-kids-fair/i);
    expect(text).not.toMatch(/스마트공장|자동화산업전|인터배터리|의료기기|머니쇼|인디뷰티/i);
  });

  it("separates Samsung COEX, COEX Magok, and multi-venue shows", () => {
    const magok = RECURRING_EXHIBITION_WATCHLIST.filter((item) =>
      hasVenue(item, "coex-magok"),
    );
    const samseong = RECURRING_EXHIBITION_WATCHLIST.filter((item) =>
      hasVenue(item, "coex-samseong"),
    );

    expect(magok.map((item) => item.slug).sort()).toEqual([
      "befe-baby-fair",
      "k-pet-fair-magok",
      "magok-living-design-fair",
    ]);
    expect(samseong.length).toBe(13);
  });

  it("marks user-included scale candidates separately from confirmed attendance", () => {
    const includedByScale = RECURRING_EXHIBITION_WATCHLIST.filter(
      (item) => item.confidence === "included_by_scale",
    );

    expect(includedByScale.map((item) => item.slug).sort()).toEqual([
      "cobe-baby-fair",
      "seoul-early-childhood-education-kids-fair",
    ]);
    for (const item of includedByScale) {
      expect(item.attendanceNote).toContain("포함");
      expect(item.notes).toContain("다음 조사 때 보강");
    }
  });
});
