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
    await repo.upsertNote(
      "u_test",
      "b_a101",
      { memo: "리필 노트 사기" },
      undefined,
    );
    const notes = await repo.listExhibitionNotes("exh_sibf_2026");
    const mine = notes.find((n) => n.boothId === "b_a101");
    expect(mine?.memo).toContain("리필");
  });

  it("getBooth: 존재하면 부스를, 없으면 null을 돌려준다", async () => {
    const b = await repo.getBooth("b_a101");
    expect(b).not.toBeNull();
    expect(b!.id).toBe("b_a101");
    expect(await repo.getBooth("no_such_booth")).toBeNull();
  });

  it("upsertNote: judgedClass가 undefined면 기존 판정을 안 건드린다", async () => {
    await repo.upsertNote(
      "u_taste",
      "b_a101",
      { status: "interested" },
      "confident",
    );
    // 메모만 고친다 — 판정은 그대로여야 한다.
    await repo.upsertNote(
      "u_taste",
      "b_a101",
      { status: "interested", memo: "다시 와보기" },
      undefined,
    );
    const notes = await repo.listNotes("u_taste");
    const n = notes.find((x) => x.boothId === "b_a101");
    expect(n?.judgedClass).toBe("confident");
    expect(n?.memo).toBe("다시 와보기");
  });

  it("getTasteAccuracy: 판정 5개 미만이면 pct는 null, judgedCount는 정확", async () => {
    await repo.upsertNote(
      "u_taste2",
      "b_a101",
      { status: "interested" },
      "confident",
    );
    const r = await repo.getTasteAccuracy("u_taste2", "exh_sibf_2026");
    expect(r.judgedCount).toBe(1);
    expect(r.pct).toBeNull();
  });

  it("setBoothRetro: visited가 아니면 null(되묻기 답 거부)", async () => {
    await repo.upsertNote(
      "u_taste3",
      "b_a101",
      { status: "interested" },
      "confident",
    );
    const result = await repo.setBoothRetro(
      "u_taste3",
      "b_a101",
      "liked",
      "confident",
    );
    expect(result).toBeNull();
  });

  it("setBoothRetro: visited면 retro·judgedClass를 저장한다", async () => {
    await repo.upsertNote(
      "u_taste4",
      "b_a101",
      { status: "visited" },
      undefined,
    );
    const result = await repo.setBoothRetro(
      "u_taste4",
      "b_a101",
      "liked",
      "uncertain",
    );
    expect(result?.retro).toBe("liked");
    expect(result?.judgedClass).toBe("uncertain");
  });

  it("listPendingRetro: visited이고 retro 없는 부스만, limit 적용", async () => {
    await repo.upsertNote(
      "u_taste5",
      "b_a101",
      { status: "visited" },
      undefined,
    );
    await repo.upsertNote(
      "u_taste5",
      "b_a1902",
      { status: "visited" },
      undefined,
    );
    const pending = await repo.listPendingRetro(
      "u_taste5",
      "exh_sibf_2026",
      10,
    );
    expect(pending.length).toBe(2);
    expect(pending.every((p) => p.boothName.length > 0)).toBe(true);
  });

  it("listExhibitionSignals: 전시 단위로 전체 사용자 신호를 최신순 반환한다", async () => {
    await repo.appendUserSignal({
      userId: "u1",
      exhibitionId: "ex1",
      kind: "reaction_interested",
      slugs: [],
    });
    await repo.appendUserSignal({
      userId: "u2",
      exhibitionId: "ex1",
      kind: "reaction_later",
      slugs: [],
    });
    await repo.appendUserSignal({
      userId: "u1",
      exhibitionId: "ex2",
      kind: "reaction_interested",
      slugs: [],
    });
    const rows = await repo.listExhibitionSignals("ex1");
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.exhibitionId === "ex1")).toBe(true);
  });

  it("listUsers: 전체를 반환하고 limit을 적용한다", async () => {
    // 주의: createdAt은 밀리초 단위(new Date().toISOString())라 빠르게 연속 생성하면
    // 같은 타임스탬프가 나올 수 있다 — 정렬 순서(어느 게 "가장 최근"인지)는 단언하지
    // 않고, 전체 개수와 limit 동작만 확인한다.
    await repo.createUser("a");
    await repo.createUser("b");
    await repo.createUser("c");
    const all = await repo.listUsers();
    expect(all).toHaveLength(3);
    expect(all.map((u) => u.nickname).sort()).toEqual(["a", "b", "c"]);
    const limited = await repo.listUsers({ limit: 2 });
    expect(limited).toHaveLength(2);
  });

  it("deleteUser: 존재하는 계정을 지우고 true를 반환, 없으면 false", async () => {
    const u = await repo.createUser("temp");
    expect(await repo.deleteUser(u.id)).toBe(true);
    expect(await repo.getUser(u.id)).toBeNull();
    expect(await repo.deleteUser("no-such-id")).toBe(false);
  });
});
