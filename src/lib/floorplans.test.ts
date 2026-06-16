import { describe, expect, it } from "vitest";
import { FLOORPLANS } from "./floorplans";
import { booths } from "./mock/seed";

describe("SIBF floorplan", () => {
  const fp = FLOORPLANS["sibf-2026"];

  it("never overlaps two booth rectangles", () => {
    const r = fp.booths.map((b) => ({
      code: b.code,
      l: b.x - b.w / 2,
      rt: b.x + b.w / 2,
      t: b.y - b.h / 2,
      bt: b.y + b.h / 2,
    }));
    for (let i = 0; i < r.length; i++) {
      for (let j = i + 1; j < r.length; j++) {
        const a = r[i];
        const b = r[j];
        // touching edges (≤2px) are fine; only a real overlap fails.
        const ox = Math.min(a.rt, b.rt) - Math.max(a.l, b.l);
        const oy = Math.min(a.bt, b.bt) - Math.max(a.t, b.t);
        expect(ox > 2 && oy > 2, `${a.code} overlaps ${b.code}`).toBe(false);
      }
    }
  });

  it("has a rect for every SIBF booth (no fallback)", () => {
    const codes = new Set(fp.booths.map((b) => b.code));
    for (const b of booths) {
      expect(codes.has(b.code!), `missing floorplan rect for ${b.code}`).toBe(
        true,
      );
    }
    expect(fp.booths.length).toBe(booths.length);
  });

  it("keeps every booth inside the canvas", () => {
    for (const b of fp.booths) {
      expect(b.x - b.w / 2).toBeGreaterThanOrEqual(0);
      expect(b.x + b.w / 2).toBeLessThanOrEqual(fp.width);
      expect(b.y - b.h / 2).toBeGreaterThanOrEqual(0);
      expect(b.y + b.h / 2).toBeLessThanOrEqual(fp.height);
    }
  });
});
