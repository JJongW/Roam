import { describe, expect, it } from "vitest";
import {
  booths,
  categories,
  exhibition,
  events,
  halls,
  reviews,
  waitings,
  welcomeKits,
} from "./seed";

const ids = new Set(booths.map((b) => b.id));
const catIds = new Set(categories.map((c) => c.id));
const hallIds = new Set(halls.map((h) => h.id));

describe("SIBF seed integrity", () => {
  it("has a substantial, unique booth set", () => {
    expect(booths.length).toBeGreaterThan(50);
    expect(ids.size).toBe(booths.length); // no duplicate ids
  });

  it("places every booth within the map bounds", () => {
    for (const b of booths) {
      expect(b.x, `${b.id} x`).toBeGreaterThanOrEqual(0);
      expect(b.x, `${b.id} x`).toBeLessThanOrEqual(exhibition.mapWidth);
      expect(b.y, `${b.id} y`).toBeGreaterThanOrEqual(0);
      expect(b.y, `${b.id} y`).toBeLessThanOrEqual(exhibition.mapHeight);
    }
  });

  it("references valid categories and halls", () => {
    for (const b of booths) {
      expect(catIds.has(b.categoryId), `${b.id} category`).toBe(true);
      expect(hallIds.has(b.hallId), `${b.id} hall`).toBe(true);
      expect(b.tags.length).toBeGreaterThan(0);
    }
  });

  it("links waitings/events/welcomeKits/reviews to real booths", () => {
    for (const w of waitings)
      expect(ids.has(w.boothId), `waiting ${w.boothId}`).toBe(true);
    for (const e of events)
      expect(ids.has(e.boothId), `event ${e.boothId}`).toBe(true);
    for (const k of welcomeKits)
      expect(ids.has(k.boothId), `kit ${k.boothId}`).toBe(true);
    for (const r of reviews)
      expect(ids.has(r.boothId), `review ${r.boothId}`).toBe(true);
  });

  it("covers every category with at least one booth", () => {
    for (const c of categories) {
      expect(
        booths.some((b) => b.categoryId === c.id),
        `category ${c.slug}`,
      ).toBe(true);
    }
  });
});
