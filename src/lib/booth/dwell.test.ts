import { describe, expect, it } from "vitest";
import { attachDwellMinutes, dwellForArea } from "./dwell";
import {
  DWELL_LARGE_MINUTES,
  DWELL_SMALL_MAX_AREA,
  DWELL_SMALL_MINUTES,
} from "@/lib/constants";
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
  it("small stand (53x53) → small dwell", () => {
    expect(dwellForArea(53, 53)).toBe(DWELL_SMALL_MINUTES);
  });

  it("large stand (110x110) → large dwell", () => {
    expect(dwellForArea(110, 110)).toBe(DWELL_LARGE_MINUTES);
  });

  it("threshold is exclusive — exactly DWELL_SMALL_MAX_AREA is large", () => {
    expect(dwellForArea(DWELL_SMALL_MAX_AREA, 1)).toBe(DWELL_LARGE_MINUTES);
    expect(dwellForArea(DWELL_SMALL_MAX_AREA - 1, 1)).toBe(DWELL_SMALL_MINUTES);
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
