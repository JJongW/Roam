import { beforeEach, describe, expect, it } from "vitest";
import { MockRepository } from "./repository";

// Reset the global store between tests for isolation.
beforeEach(() => {
  (globalThis as unknown as { __roamStore?: unknown }).__roamStore = undefined;
});

describe("MockRepository", () => {
  const repo = new MockRepository();

  it("seeds the SIBF exhibition", async () => {
    const detail = await repo.getExhibition("sibf-2026");
    expect(detail).not.toBeNull();
    expect(detail!.halls.length).toBe(2);
    expect(detail!.categories.length).toBe(6);
  });

  it("lists booths filtered by category", async () => {
    const all = await repo.listBooths("sibf-2026", { limit: 200 });
    expect(all.data.length).toBeGreaterThan(50);
    const art = await repo.listBooths("sibf-2026", {
      categoryId: "cat_art",
    });
    expect(art.data.length).toBeGreaterThan(0);
    expect(art.data.every((b) => b.categoryId === "cat_art")).toBe(true);
  });

  it("returns booth detail with review summary", async () => {
    const detail = await repo.getBoothDetail("b_a1902");
    expect(detail!.booth.code).toBe("A1902");
    expect(detail!.reviewSummary.count).toBeGreaterThan(0);
  });

  it("creates a session and persists a preference", async () => {
    const session = await repo.createSession("exh_sibf_2026");
    await repo.savePreference(session.id, {
      visitPurposes: ["purchase", "experience"],
      interests: ["art"],
      availableMinutes: 120,
      movementPreference: "balanced",
      companionType: "alone",
    });
    const pref = await repo.getPreference(session.id);
    expect(pref!.visitPurposes).toEqual(["purchase", "experience"]);
  });

  it("adds a review and updates the summary", async () => {
    const before = await repo.listReviews("b_b601");
    await repo.createReview("b_b601", "sess_x", {
      comment: "great",
      authorName: "tester",
    });
    const after = await repo.listReviews("b_b601");
    expect(after.summary.count).toBe(before.summary.count + 1);
  });

  it("is idempotent for bookmarks", async () => {
    const s = await repo.createSession("exh_sibf_2026");
    await repo.addBookmark(s.id, { targetType: "booth", targetId: "b_b601" });
    await repo.addBookmark(s.id, { targetType: "booth", targetId: "b_b601" });
    const list = await repo.listBookmarks(s.id);
    expect(list.length).toBe(1);
  });

  it("aggregates a booth heatmap from saved routes", async () => {
    const s = await repo.createSession("exh_sibf_2026");
    const leg = { from: "x", to: "y", minutes: 1, distance: 1 };
    await repo.saveRoute(s.id, "exh_sibf_2026", {
      boothIds: ["b_a101", "b_a201", "b_a301"],
      estimatedMinutes: 10,
      legs: [leg],
      scores: {},
      currentBoothId: "b_a101",
    });
    await repo.saveRoute(s.id, "exh_sibf_2026", {
      boothIds: ["b_a101", "b_a201"],
      estimatedMinutes: 8,
      legs: [leg],
      scores: {},
      currentBoothId: "b_a101",
    });
    const heat = await repo.boothHeatmap("exh_sibf_2026");
    expect(heat.booths["b_a101"]).toBe(2);
    expect(heat.booths["b_a301"]).toBe(1);
    const pair = heat.pairs.find(
      (p) => p.from === "b_a101" && p.to === "b_a201",
    );
    expect(pair?.count).toBe(2);
  });

  it("lists exhibition notes for keyword extraction", async () => {
    await repo.upsertNote("u_test", "b_a101", { memo: "리필 노트 사기" });
    const notes = await repo.listExhibitionNotes("exh_sibf_2026");
    const mine = notes.find((n) => n.boothId === "b_a101");
    expect(mine?.memo).toContain("리필");
  });
});
