import { describe, expect, it } from "vitest";
import { attachDwellMinutes, dwellForArea } from "./dwell";
import { DWELL_TIERS } from "@/lib/constants";
import { FLOORPLANS } from "@/lib/floorplans";
import type { Booth } from "@/lib/types";

function booth(code: string): Booth {
  return {
    id: `id-${code}`,
    exhibitionId: "e1",
    hallId: "h1",
    categoryId: "c1",
    code,
    name: code,
    company: "Co",
    description: "",
    longDescription: "",
    images: [],
    tags: [],
    x: 0,
    y: 0,
    popularity: 50,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("dwellForArea", () => {
  it("smallest stand (53x53 = 2809) → 2분", () => {
    expect(dwellForArea(53, 53)).toBe(2);
  });

  it("53x110 (5830) → 4분", () => {
    expect(dwellForArea(53, 110)).toBe(4);
  });

  it("110x110 (12100) → 6분", () => {
    expect(dwellForArea(110, 110)).toBe(6);
  });

  it("110x224 (24640) → 8분", () => {
    expect(dwellForArea(110, 224)).toBe(8);
  });

  it("largest stand (417x407) → 10분", () => {
    expect(dwellForArea(417, 407)).toBe(10);
  });

  it("tiers are first-match on ascending maxArea", () => {
    for (const t of DWELL_TIERS) {
      if (t.maxArea === Infinity) continue;
      expect(dwellForArea(t.maxArea - 1, 1)).toBeLessThanOrEqual(t.minutes);
    }
  });
});

describe("attachDwellMinutes", () => {
  const fp = FLOORPLANS["sibf-2026"];

  it("fills dwellMinutes from floorplan geometry by code", () => {
    const fpBooth = fp.booths[0];
    const b = booth(fpBooth.code);
    attachDwellMinutes("sibf-2026", [b]);
    expect(b.dwellMinutes).toBe(dwellForArea(fpBooth.w, fpBooth.h));
  });

  it("leaves dwellMinutes unset for codes not in the floorplan", () => {
    const b = booth("__not_a_real_code__");
    attachDwellMinutes("sibf-2026", [b]);
    expect(b.dwellMinutes).toBeUndefined();
  });

  it("is a no-op for an unknown exhibition slug", () => {
    const fpBooth = fp.booths[0];
    const b = booth(fpBooth.code);
    attachDwellMinutes("__no_such_exhibition__", [b]);
    expect(b.dwellMinutes).toBeUndefined();
  });
});
