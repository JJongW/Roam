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
    expect(detail!.reviewSummary.avg).toBeGreaterThan(0);
  });

  it("creates a session and persists a preference", async () => {
    const session = await repo.createSession("exh_sibf_2026");
    await repo.savePreference(session.id, {
      visitPurpose: "purchase",
      interests: ["art"],
      availableMinutes: 120,
      movementPreference: "balanced",
      companionType: "alone",
    });
    const pref = await repo.getPreference(session.id);
    expect(pref!.visitPurpose).toBe("purchase");
  });

  it("adds a review and updates the summary", async () => {
    const before = await repo.listReviews("b_b601");
    await repo.createReview("b_b601", "sess_x", {
      rating: 5,
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

  it("upserts waiting info", async () => {
    const w = await repo.upsertWaiting("b_b601", {
      enabled: true,
      queueCount: 5,
      estimatedMinutes: 3,
    });
    expect(w.queueCount).toBe(5);
    const got = await repo.getWaiting("b_b601");
    expect(got!.estimatedMinutes).toBe(3);
  });
});
