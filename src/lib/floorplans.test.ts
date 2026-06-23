import { describe, expect, it } from "vitest";
import { FLOORPLANS } from "./floorplans";
import { aisleRoute } from "./aisle-route";
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

  it("defines a walkable interior covering every booth", () => {
    const interior = fp.interior ?? [];
    expect(interior.length).toBeGreaterThan(0);
    const inside = (x: number, y: number) =>
      interior.some(
        (r) =>
          x >= r.x - r.w / 2 &&
          x <= r.x + r.w / 2 &&
          y >= r.y - r.h / 2 &&
          y <= r.y + r.h / 2,
      );
    // Every booth centre must sit inside the walkable region (so it's routable).
    for (const b of fp.booths)
      expect(inside(b.x, b.y), `booth ${b.code} outside interior`).toBe(true);
    // Gates too.
    for (const g of fp.gates ?? [])
      expect(inside(g.x, g.y), `gate ${g.id} outside interior`).toBe(true);
  });

  it("routes a cross-hall path that never leaves the building", () => {
    const interior = fp.interior ?? [];
    const inside = (x: number, y: number) =>
      interior.some(
        (r) =>
          x >= r.x - r.w / 2 - 1 &&
          x <= r.x + r.w / 2 + 1 &&
          y >= r.y - r.h / 2 - 1 &&
          y <= r.y + r.h / 2 + 1,
      );
    // Pick booths from both halls so the route must use the passage.
    const a = fp.booths.find((b) => b.code.startsWith("A1"))!;
    const b = fp.booths.find((x) => x.code.startsWith("B"))!;
    const stops = [
      fp.entrance!,
      { x: a.x, y: a.y },
      { x: b.x, y: b.y },
      fp.exit!,
    ];
    const pts = aisleRoute(
      stops,
      fp.booths.map((bb) => ({ x: bb.x, y: bb.y, w: bb.w, h: bb.h })),
      fp.width,
      fp.height,
      fp.interior,
    );
    expect(pts.length).toBeGreaterThan(2);
    // Sample along every segment — no point may fall outside the building.
    for (let i = 1; i < pts.length; i++) {
      const p0 = pts[i - 1];
      const p1 = pts[i];
      const steps = 12;
      for (let s = 0; s <= steps; s++) {
        const x = p0.x + ((p1.x - p0.x) * s) / steps;
        const y = p0.y + ((p1.y - p0.y) * s) / steps;
        expect(
          inside(x, y),
          `route point (${Math.round(x)},${Math.round(y)}) left the building`,
        ).toBe(true);
      }
    }
  });
});
