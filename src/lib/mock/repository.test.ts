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

  it("upsertBoothEnrichment: 저작 필드를 채우고 기존 goodsKeywords는 보존한다", async () => {
    const before = await repo.getBooth("b_a1902");
    const goodsBefore = before!.enrichment?.goodsKeywords ?? [];

    await repo.upsertBoothEnrichment("b_a1902", {
      summary: "요약 문장",
      valueTags: [{ slug: "discovery", strength: 0.8 }],
      recommendationReasons: { discovery: "낯선 걸 발견하기 좋아" },
      thingsToDo: ["신간 훑기"],
      timing: ["오후 2시 사인회"],
      memoryHooks: ["파란 부스"],
    });

    const after = await repo.getBooth("b_a1902");
    expect(after!.enrichment?.summary).toBe("요약 문장");
    expect(after!.enrichment?.valueTags).toEqual([
      { slug: "discovery", strength: 0.8 },
    ]);
    expect(after!.enrichment?.recommendationReasons).toEqual({
      discovery: "낯선 걸 발견하기 좋아",
    });
    expect(after!.enrichment?.thingsToDo).toEqual(["신간 훑기"]);
    expect(after!.enrichment?.timing).toEqual(["오후 2시 사인회"]);
    expect(after!.enrichment?.memoryHooks).toEqual(["파란 부스"]);
    // 저작 필드가 아닌 기존 필드는 안 건드림
    expect(after!.enrichment?.goodsKeywords ?? []).toEqual(goodsBefore);
  });

  it("upsertBoothEnrichment: 빈 배열/빈 객체는 undefined로 저장한다(폼을 비우면 결측으로 되돌아감)", async () => {
    await repo.upsertBoothEnrichment("b_a1902", {
      summary: "",
      valueTags: [],
      recommendationReasons: {},
      thingsToDo: [],
      timing: [],
      memoryHooks: [],
    });
    const after = await repo.getBooth("b_a1902");
    expect(after!.enrichment?.summary).toBeUndefined();
    expect(after!.enrichment?.valueTags).toBeUndefined();
    expect(after!.enrichment?.recommendationReasons).toBeUndefined();
    expect(after!.enrichment?.thingsToDo).toBeUndefined();
    expect(after!.enrichment?.timing).toBeUndefined();
    expect(after!.enrichment?.memoryHooks).toBeUndefined();
  });

  it("upsertNote: judgedClass가 undefined면 기존 판정을 안 건드린다", async () => {
    await repo.upsertNote(
      "u_taste",
      "b_a101",
      { interest: "must" },
      "confident",
    );
    // 메모만 고친다 — 판정은 그대로여야 한다.
    await repo.upsertNote(
      "u_taste",
      "b_a101",
      { interest: "must", memo: "다시 와보기" },
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
      { interest: "must" },
      "confident",
    );
    const r = await repo.getTasteAccuracy("u_taste2", "exh_sibf_2026");
    expect(r.judgedCount).toBe(1);
    expect(r.pct).toBeNull();
  });

  describe("upsertNote — interest/verdict 직교", () => {
    it("interest만 써도 verdict는 안 건드린다", async () => {
      await repo.upsertNote(
        "u_taste6",
        "b_a101",
        { interest: "must" },
        "confident",
      );
      await repo.upsertNote(
        "u_taste6",
        "b_a101",
        { verdict: "good" },
        "confident",
      );
      const notes = await repo.listNotes("u_taste6");
      const n = notes.find((x) => x.boothId === "b_a101")!;
      expect(n.interest).toBe("must");
      expect(n.verdict).toBe("good");
    });

    it("verdict를 쓰면 visitedAt이 채워진다", async () => {
      const note = await repo.upsertNote(
        "u_taste7",
        "b_a101",
        { verdict: "ok" },
        "uncertain",
      );
      expect(note.visitedAt).toBeDefined();
    });

    it("verdict를 해제하면 visitedAt도 같이 지워진다", async () => {
      await repo.upsertNote(
        "u_taste8",
        "b_a101",
        { verdict: "good" },
        "confident",
      );
      const cleared = await repo.upsertNote(
        "u_taste8",
        "b_a101",
        { verdict: null },
        null,
      );
      expect(cleared.verdict).toBeUndefined();
      expect(cleared.visitedAt).toBeUndefined();
    });

    it("interest만 바꾸는 쓰기(verdict:undefined)는 기존 verdict·visitedAt을 안 지운다 — judgment-vocabulary 최종 리뷰 Fix 1 회귀", async () => {
      // verdict 쓰기로 visitedAt이 생긴 레거시/기존 방문 기록을 시뮬레이션.
      await repo.upsertNote(
        "u_taste10",
        "b_a101",
        { verdict: "good" },
        "confident",
      );
      const seeded = (await repo.listNotes("u_taste10")).find(
        (n) => n.boothId === "b_a101",
      )!;
      expect(seeded.verdict).toBe("good");
      expect(seeded.visitedAt).toBeDefined();

      // interest만 바꾸는 쓰기 — verdict는 undefined로 온다(null이 아니라).
      const after = await repo.upsertNote(
        "u_taste10",
        "b_a101",
        { interest: "must" },
        "confident",
      );
      expect(after.interest).toBe("must");
      expect(after.verdict).toBe("good");
      expect(after.visitedAt).toBe(seeded.visitedAt);
    });

    it("메모를 지워 빈 문자열이 돼도(사진 없음) interest/verdict를 안 건드리는 요청이면 노트를 지우지 않는다 — Supabase upsertNote 델리트 오판 회귀", async () => {
      // interest만 있고 메모·사진은 아직 없는 노트.
      await repo.upsertNote(
        "u_taste11",
        "b_a101",
        { interest: "must" },
        "confident",
      );
      // 메모를 한 번 채웠다가(사진 없음) — 실제 UI(booth-personal-panel.tsx 등)는
      // pushNote(id, {}) 로 이 편집을 보낸다: interest·verdict는 body에서 아예
      // 빠지고 memo만 실린다.
      await repo.upsertNote(
        "u_taste11",
        "b_a101",
        { memo: "hello" },
        undefined,
      );
      // 이제 그 메모를 다시 빈 문자열로 지운다 — interest·verdict는 여전히 안
      // 건드리는 요청. 버그가 있으면 raw input만 보고 "다 비었다"고 오판해
      // 행 전체를 지워 interest='must'까지 날린다.
      const after = await repo.upsertNote(
        "u_taste11",
        "b_a101",
        { memo: "" },
        undefined,
      );
      expect(after.interest).toBe("must");
      const notes = await repo.listNotes("u_taste11");
      expect(notes.find((n) => n.boothId === "b_a101")?.interest).toBe("must");
    });

    it("listPendingRetro: visitedAt 있고 verdict 없는 부스만", async () => {
      await repo.upsertNote(
        "u_taste5",
        "b_a101",
        { verdict: "good" },
        "confident",
      );
      // b_a101은 verdict를 이미 답했다 — pending에서 빠져야 한다.
      await repo.upsertNote(
        "u_taste5",
        "b_a1902",
        { verdict: "ok" },
        "confident",
      );
      // 정상 upsertNote로는 verdict 없이 visitedAt만 생길 수 없다(둘이 항상 같이
      // 쓰인다) — 되묻기 대상은 레거시 행뿐이라는 게 이 메서드의 전제다. 그 레거시
      // 상태를 시뮬레이션하려고 스토어에서 b_a1902의 verdict만 직접 지운다
      // (visitedAt은 남긴다).
      const store = (
        globalThis as unknown as {
          __roamStore: {
            notes: Array<{ userId: string; boothId: string; verdict?: string }>;
          };
        }
      ).__roamStore;
      const legacy = store.notes.find(
        (n) => n.userId === "u_taste5" && n.boothId === "b_a1902",
      )!;
      delete legacy.verdict;
      const pending = await repo.listPendingRetro(
        "u_taste5",
        "exh_sibf_2026",
        10,
      );
      expect(pending.map((p) => p.boothId)).toEqual(["b_a1902"]);
    });

    it("listMustNotVisited: interest='must'이고 visitedAt 없는 부스만", async () => {
      await repo.upsertNote(
        "u_taste9",
        "b_a101",
        { interest: "must" },
        "confident",
      );
      await repo.upsertNote(
        "u_taste9",
        "b_a1902",
        { interest: "must" },
        "confident",
      );
      await repo.upsertNote(
        "u_taste9",
        "b_a1902",
        { verdict: "good" },
        "confident",
      ); // b_a1902는 다녀옴
      const result = await repo.listMustNotVisited(
        "u_taste9",
        "exh_sibf_2026",
        10,
      );
      expect(result.map((r) => r.boothId)).toEqual(["b_a101"]);
    });
  });

  it("listExhibitionSignals: 전시 단위로 전체 사용자 신호를 최신순 반환한다", async () => {
    await repo.appendUserSignal({
      userId: "u1",
      exhibitionId: "ex1",
      kind: "reaction_must",
      slugs: [],
    });
    await repo.appendUserSignal({
      userId: "u2",
      exhibitionId: "ex1",
      kind: "reaction_curious",
      slugs: [],
    });
    await repo.appendUserSignal({
      userId: "u1",
      exhibitionId: "ex2",
      kind: "reaction_must",
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

  it("updateNickname: 닉네임을 바꾸고 갱신된 계정을 반환, 없으면 null", async () => {
    const u = await repo.createUser("before");
    const updated = await repo.updateNickname(u.id, "after");
    expect(updated?.nickname).toBe("after");
    expect((await repo.getUser(u.id))?.nickname).toBe("after");
    expect(await repo.updateNickname("no-such-id", "x")).toBeNull();
  });
});

describe("logIssue / listIssues", () => {
  it("적재한 이슈를 최신순으로 돌려준다", async () => {
    const repo = new MockRepository();
    await repo.logIssue({ source: "server", message: "첫 번째 오류" });
    await repo.logIssue({ source: "client", message: "두 번째 오류" });
    const issues = await repo.listIssues();
    expect(issues.map((i) => i.message)).toEqual([
      "두 번째 오류",
      "첫 번째 오류",
    ]);
  });

  it("source로 필터링한다", async () => {
    const repo = new MockRepository();
    await repo.logIssue({ source: "server", message: "서버 오류" });
    await repo.logIssue({ source: "client", message: "클라 오류" });
    const serverOnly = await repo.listIssues({ source: "server" });
    expect(serverOnly).toHaveLength(1);
    expect(serverOnly[0].message).toBe("서버 오류");
  });

  it("limit을 적용한다", async () => {
    const repo = new MockRepository();
    for (let i = 0; i < 5; i++) {
      await repo.logIssue({ source: "server", message: `오류 ${i}` });
    }
    const limited = await repo.listIssues({ limit: 2 });
    expect(limited).toHaveLength(2);
  });

  it("sinceDays로 기간을 좁힌다", async () => {
    const repo = new MockRepository();
    await repo.logIssue({ source: "server", message: "오래된 오류" });
    await repo.logIssue({ source: "server", message: "최근 오류" });

    // logIssue가 createdAt=지금으로 찍으므로 store를 직접 조작해 시각을 되돌린다.
    const store = (
      globalThis as unknown as {
        __roamStore: {
          issueLogs: Array<{ message: string; createdAt: string }>;
        };
      }
    ).__roamStore;
    const stale = store.issueLogs.find((i) => i.message === "오래된 오류")!;
    stale.createdAt = new Date(
      Date.now() - 31 * 24 * 60 * 60 * 1000,
    ).toISOString();

    const recent = await repo.listIssues({ sinceDays: 30 });
    expect(recent.map((i) => i.message)).toEqual(["최근 오류"]);
  });

  it("olderThanDays보다 오래된 것만 지우고 개수를 반환한다", async () => {
    const repo = new MockRepository();
    await repo.logIssue({ source: "server", message: "old-1" });
    await repo.logIssue({ source: "server", message: "old-2" });
    await repo.logIssue({ source: "server", message: "recent-1" });

    // logIssue가 createdAt=지금으로 찍으므로, 테스트에선 store를 직접 조작해
    // 시각을 되돌린다 — 247번째 줄 근방 listPendingRetro 테스트와 같은 패턴.
    const store = (
      globalThis as unknown as {
        __roamStore: {
          issueLogs: Array<{ message: string; createdAt: string }>;
        };
      }
    ).__roamStore;
    const now = Date.now();
    const old = new Date(now - 31 * 24 * 60 * 60 * 1000).toISOString();
    const recent = new Date(now - 1 * 24 * 60 * 60 * 1000).toISOString();
    const old1 = store.issueLogs.find((i) => i.message === "old-1")!;
    const old2 = store.issueLogs.find((i) => i.message === "old-2")!;
    const recent1 = store.issueLogs.find((i) => i.message === "recent-1")!;
    old1.createdAt = old;
    old2.createdAt = old;
    recent1.createdAt = recent;

    const deleted = await repo.deleteOldIssues(30);
    expect(deleted).toBe(2);

    const remaining = await repo.listIssues();
    expect(remaining.map((i) => i.message)).toEqual(["recent-1"]);
  });

  it("지울 게 없으면 0을 반환한다", async () => {
    const repo = new MockRepository();
    const deleted = await repo.deleteOldIssues(30);
    expect(deleted).toBe(0);
  });
});

describe("listNotesByBoothIds", () => {
  it("주어진 부스 id에 해당하는 노트만 반환한다", async () => {
    const repo = new MockRepository();
    const all = await repo.listBooths("sibf-2026", { limit: 5 });
    const [a, b] = all.data;
    await repo.upsertNote("user-1", a.id, { interest: "must" }, "confident");
    await repo.upsertNote("user-2", b.id, { interest: "curious" }, "confident");
    const notes = await repo.listNotesByBoothIds([a.id]);
    expect(notes).toHaveLength(1);
    expect(notes[0].boothId).toBe(a.id);
  });
});

describe("analytics 재배선", () => {
  it("listReflectedUserIds: visits에 해당 전시가 있는 사용자만", async () => {
    const repo = new MockRepository();
    const detail = await repo.getExhibition("sibf-2026");
    const exhibitionId = detail!.exhibition.id;
    const baseBrain = {
      version: 1,
      updatedAt: "2026-08-12T00:00:00Z",
      literacy: { overall: 0, byTheme: {}, visitsCount: 0, boothsSeenCount: 0 },
      interests: [],
      mutedSlugs: [],
      preferences: {},
      goals: [],
      health: {
        lastDistilledAt: "2026-08-12T00:00:00Z",
        decayHalfLifeDays: 30,
      },
    };
    await repo.saveUserBrain({
      ...baseBrain,
      userId: "u1",
      visits: [
        {
          exhibitionId,
          visitId: "v1",
          date: "2026-08-12",
          boothsVisited: [],
          themesEngaged: [],
          highlights: [],
          summary: "요약",
        },
      ],
    });
    await repo.saveUserBrain({
      ...baseBrain,
      userId: "u2",
      visits: [],
    });
    const ids = await repo.listReflectedUserIds(exhibitionId);
    expect(ids).toEqual(["u1"]);
  });

  it("analyticsPopular: 정적 popularity 가산 없이 실제 view만 센다", async () => {
    const repo = new MockRepository();
    const all = await repo.listBooths("sibf-2026", { limit: 5 });
    const target = all.data[0];
    await repo.recordAnalytics("s1", target.exhibitionId, {
      type: "view",
      boothId: target.id,
    });
    const popular = await repo.analyticsPopular(target.exhibitionId, 5);
    const row = popular.find((p) => p.boothId === target.id)!;
    expect(row.views).toBe(1);
  });

  it("analyticsFlow: booth_arrive 대신 view 시퀀스로 근사한다", async () => {
    const repo = new MockRepository();
    const all = await repo.listBooths("sibf-2026", { limit: 5 });
    const [a, b] = all.data;
    await repo.recordAnalytics("s1", a.exhibitionId, {
      type: "view",
      boothId: a.id,
    });
    await repo.recordAnalytics("s1", a.exhibitionId, {
      type: "view",
      boothId: b.id,
    });
    const edges = await repo.analyticsFlow(a.exhibitionId);
    expect(edges).toContainEqual({ from: a.id, to: b.id, count: 1 });
  });
});
