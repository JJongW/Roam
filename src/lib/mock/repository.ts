import { uid, shortId } from "@/lib/utils";
import { REPORT_HIDE_THRESHOLD } from "@/lib/constants";
import { freshSeed } from "@/lib/mock/seed";
import type { ListBoothQuery, Repository } from "@/lib/repositories/types";
import type {
  AnalyticsEvent,
  Booth,
  BoothDetail,
  BoothEvent,
  Bookmark,
  BoothNote,
  Category,
  CommunityPost,
  CommunityReport,
  DeletePostResult,
  ReportResult,
  Exhibition,
  ExhibitionDetail,
  Hall,
  Paginated,
  Review,
  RoutePlan,
  SharedRoute,
  User,
  UserPreference,
  VisitorSession,
  WelcomeKit,
} from "@/lib/types";
import type {
  AnalyticsEventInput,
  BookmarkInput,
  BoothInput,
  BoothNoteInput,
  CommunityPostInput,
  EventInput,
  ExhibitionInput,
  ReviewInput,
  RoutePatch,
  RoutePublishInput,
  UserPreferenceInput,
  WelcomeKitInput,
} from "@/lib/schemas";

interface Store {
  exhibitions: Exhibition[];
  halls: Hall[];
  categories: Category[];
  booths: Booth[];
  events: BoothEvent[];
  welcomeKits: WelcomeKit[];
  reviews: Review[];
  sessions: VisitorSession[];
  preferences: UserPreference[];
  routes: RoutePlan[];
  bookmarks: Bookmark[];
  posts: CommunityPost[];
  reports: CommunityReport[];
  users: User[];
  notes: BoothNote[];
  analytics: AnalyticsEvent[];
}

// Persist across HMR / route invocations in a single Node process.
const g = globalThis as unknown as { __roamStore?: Store };

function buildStore(): Store {
  const s = freshSeed();
  return {
    exhibitions: [s.exhibition],
    halls: s.halls,
    categories: s.categories,
    booths: s.booths,
    events: s.events,
    welcomeKits: s.welcomeKits,
    reviews: s.reviews,
    sessions: [],
    preferences: [],
    routes: [],
    bookmarks: [],
    posts: s.communityPosts,
    reports: [],
    users: [],
    notes: [],
    analytics: [],
  };
}

function store(): Store {
  if (!g.__roamStore) g.__roamStore = buildStore();
  return g.__roamStore;
}

function now(): string {
  return new Date().toISOString();
}

function paginate<T extends { id: string }>(
  items: T[],
  cursor?: string,
  limit = 50,
): Paginated<T> {
  const start = cursor ? items.findIndex((i) => i.id === cursor) + 1 : 0;
  const slice = items.slice(start, start + limit);
  const nextCursor =
    start + limit < items.length ? (slice[slice.length - 1]?.id ?? null) : null;
  return { data: slice, nextCursor };
}

export class MockRepository implements Repository {
  readonly mode = "mock" as const;

  async listExhibitions(opts?: { cursor?: string; limit?: number }) {
    return paginate(store().exhibitions, opts?.cursor, opts?.limit);
  }

  async getExhibition(slug: string): Promise<ExhibitionDetail | null> {
    const exhibition = store().exhibitions.find((e) => e.slug === slug);
    if (!exhibition) return null;
    return {
      exhibition,
      halls: store()
        .halls.filter((h) => h.exhibitionId === exhibition.id)
        .sort((a, b) => a.sort - b.sort),
      categories: store().categories,
    };
  }

  async createExhibition(input: ExhibitionInput): Promise<Exhibition> {
    const ex: Exhibition = { id: uid("exh"), createdAt: now(), ...input };
    store().exhibitions.push(ex);
    return ex;
  }

  async updateExhibition(id: string, input: Partial<ExhibitionInput>) {
    const ex = store().exhibitions.find((e) => e.id === id);
    if (!ex) return null;
    Object.assign(ex, input);
    return ex;
  }

  async deleteExhibition(id: string) {
    const s = store();
    const i = s.exhibitions.findIndex((e) => e.id === id);
    if (i < 0) return false;
    s.exhibitions.splice(i, 1);
    return true;
  }

  async listBooths(
    slug: string,
    query?: ListBoothQuery,
  ): Promise<Paginated<Booth>> {
    const ex = store().exhibitions.find((e) => e.slug === slug);
    if (!ex) return { data: [], nextCursor: null };
    let list = store().booths.filter((b) => b.exhibitionId === ex.id);
    if (query?.hallId) list = list.filter((b) => b.hallId === query.hallId);
    if (query?.categoryId)
      list = list.filter((b) => b.categoryId === query.categoryId);
    if (query?.q) {
      const q = query.q.toLowerCase();
      list = list.filter(
        (b) =>
          b.name.toLowerCase().includes(q) ||
          b.company.toLowerCase().includes(q),
      );
    }
    list = list.sort(
      (a, b) => b.popularity - a.popularity || a.id.localeCompare(b.id),
    );
    return paginate(list, query?.cursor, query?.limit);
  }

  async listBoothsByExhibitionId(exhibitionId: string): Promise<Booth[]> {
    return store().booths.filter((b) => b.exhibitionId === exhibitionId);
  }

  async getBoothDetail(id: string): Promise<BoothDetail | null> {
    const booth = store().booths.find((b) => b.id === id);
    if (!booth) return null;
    const category = store().categories.find((c) => c.id === booth.categoryId)!;
    const reviews = store()
      .reviews.filter((r) => r.boothId === id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const count = reviews.length;
    const avg = count
      ? Number((reviews.reduce((s, r) => s + r.rating, 0) / count).toFixed(2))
      : 0;
    return {
      booth,
      category,
      welcomeKit: store().welcomeKits.find((w) => w.boothId === id),
      events: store()
        .events.filter((e) => e.boothId === id)
        .sort((a, b) => a.startTime.localeCompare(b.startTime)),
      reviews,
      reviewSummary: { avg, count },
    };
  }

  async createBooth(input: BoothInput): Promise<Booth> {
    const booth: Booth = { id: uid("booth"), createdAt: now(), ...input };
    store().booths.push(booth);
    return booth;
  }

  async updateBooth(id: string, input: Partial<BoothInput>) {
    const b = store().booths.find((x) => x.id === id);
    if (!b) return null;
    Object.assign(b, input);
    return b;
  }

  async deleteBooth(id: string) {
    const s = store();
    const i = s.booths.findIndex((b) => b.id === id);
    if (i < 0) return false;
    s.booths.splice(i, 1);
    return true;
  }

  async listCategories(): Promise<Category[]> {
    return store().categories;
  }

  async listHalls(exhibitionId: string): Promise<Hall[]> {
    return store()
      .halls.filter((h) => h.exhibitionId === exhibitionId)
      .sort((a, b) => a.sort - b.sort);
  }

  async listEvents(
    slug: string,
    opts?: { boothId?: string; from?: string; to?: string },
  ): Promise<BoothEvent[]> {
    const ex = store().exhibitions.find((e) => e.slug === slug);
    if (!ex) return [];
    const boothIds = new Set(
      store()
        .booths.filter((b) => b.exhibitionId === ex.id)
        .map((b) => b.id),
    );
    let list = store().events.filter((e) => boothIds.has(e.boothId));
    if (opts?.boothId) list = list.filter((e) => e.boothId === opts.boothId);
    if (opts?.from) list = list.filter((e) => e.endTime >= opts.from!);
    if (opts?.to) list = list.filter((e) => e.startTime <= opts.to!);
    return list.sort((a, b) => a.startTime.localeCompare(b.startTime));
  }

  async createEvent(input: EventInput): Promise<BoothEvent> {
    const ev: BoothEvent = { id: uid("ev"), ...input };
    store().events.push(ev);
    return ev;
  }

  async updateEvent(id: string, input: Partial<EventInput>) {
    const ev = store().events.find((e) => e.id === id);
    if (!ev) return null;
    Object.assign(ev, input);
    return ev;
  }

  async deleteEvent(id: string) {
    const s = store();
    const i = s.events.findIndex((e) => e.id === id);
    if (i < 0) return false;
    s.events.splice(i, 1);
    return true;
  }

  async getWelcomeKit(boothId: string) {
    return store().welcomeKits.find((w) => w.boothId === boothId) ?? null;
  }

  async upsertWelcomeKit(
    boothId: string,
    input: WelcomeKitInput,
  ): Promise<WelcomeKit> {
    const s = store();
    let w = s.welcomeKits.find((x) => x.boothId === boothId);
    if (!w) {
      w = { boothId, ...input };
      s.welcomeKits.push(w);
    } else {
      Object.assign(w, input);
    }
    return w;
  }

  async listReviews(
    boothId: string,
    opts?: { cursor?: string; limit?: number },
  ) {
    const all = store()
      .reviews.filter((r) => r.boothId === boothId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const count = all.length;
    const avg = count
      ? Number((all.reduce((s, r) => s + r.rating, 0) / count).toFixed(2))
      : 0;
    return {
      ...paginate(all, opts?.cursor, opts?.limit),
      summary: { avg, count },
    };
  }

  async createReview(
    boothId: string,
    sessionId: string,
    input: ReviewInput,
  ): Promise<Review> {
    const review: Review = {
      id: uid("rv"),
      boothId,
      sessionId,
      createdAt: now(),
      ...input,
    };
    store().reviews.push(review);
    return review;
  }

  async createSession(exhibitionId: string): Promise<VisitorSession> {
    const session: VisitorSession = {
      id: uid("sess"),
      exhibitionId,
      createdAt: now(),
      lastSeenAt: now(),
    };
    store().sessions.push(session);
    return session;
  }

  async getSession(id: string) {
    return store().sessions.find((s) => s.id === id) ?? null;
  }

  async getPreference(sessionId: string) {
    return store().preferences.find((p) => p.sessionId === sessionId) ?? null;
  }

  async savePreference(
    sessionId: string,
    input: UserPreferenceInput,
  ): Promise<UserPreference> {
    const s = store();
    let p = s.preferences.find((x) => x.sessionId === sessionId);
    if (!p) {
      p = { sessionId, ...input, updatedAt: now() };
      s.preferences.push(p);
    } else {
      Object.assign(p, input, { updatedAt: now() });
    }
    return p;
  }

  async saveRoute(
    sessionId: string,
    exhibitionId: string,
    plan: Omit<
      RoutePlan,
      | "id"
      | "sessionId"
      | "userId"
      | "exhibitionId"
      | "createdAt"
      | "status"
      | "visitedBoothIds"
      | "title"
      | "isPublic"
      | "shareId"
    >,
    userId?: string,
    title?: string,
  ): Promise<RoutePlan> {
    const route: RoutePlan = {
      id: uid("route"),
      sessionId,
      userId,
      exhibitionId,
      createdAt: now(),
      status: "active",
      visitedBoothIds: [],
      isPublic: false,
      title,
      ...plan,
    };
    store().routes.push(route);
    return route;
  }

  async getRoute(id: string) {
    return store().routes.find((r) => r.id === id) ?? null;
  }

  async listMyRoutes(owner: {
    sessionId: string;
    userId?: string;
  }): Promise<RoutePlan[]> {
    return store()
      .routes.filter(
        (r) =>
          r.title != null &&
          (owner.userId
            ? r.userId === owner.userId
            : r.sessionId === owner.sessionId),
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async deleteRoute(
    id: string,
    owner: { sessionId: string; userId?: string },
  ): Promise<boolean> {
    const routes = store().routes;
    const i = routes.findIndex(
      (r) =>
        r.id === id &&
        ((owner.userId && r.userId === owner.userId) ||
          r.sessionId === owner.sessionId),
    );
    if (i === -1) return false;
    routes.splice(i, 1);
    return true;
  }

  async patchRoute(id: string, patch: RoutePatch): Promise<RoutePlan | null> {
    const r = store().routes.find((x) => x.id === id);
    if (!r) return null;
    if (patch.currentBoothId !== undefined)
      r.currentBoothId = patch.currentBoothId;
    if (patch.visitedBoothIds !== undefined)
      r.visitedBoothIds = patch.visitedBoothIds;
    if (patch.status !== undefined) r.status = patch.status;
    if (patch.boothIds !== undefined) r.boothIds = patch.boothIds;
    if (patch.legs !== undefined) r.legs = patch.legs;
    if (patch.estimatedMinutes !== undefined)
      r.estimatedMinutes = patch.estimatedMinutes;
    return r;
  }

  async listBookmarks(sessionId: string) {
    return store().bookmarks.filter((b) => b.sessionId === sessionId);
  }

  async addBookmark(
    sessionId: string,
    input: BookmarkInput,
  ): Promise<Bookmark> {
    const s = store();
    const existing = s.bookmarks.find(
      (b) =>
        b.sessionId === sessionId &&
        b.targetType === input.targetType &&
        b.targetId === input.targetId,
    );
    if (existing) return existing;
    const bm: Bookmark = {
      id: uid("bm"),
      sessionId,
      createdAt: now(),
      ...input,
    };
    s.bookmarks.push(bm);
    return bm;
  }

  async removeBookmark(sessionId: string, input: BookmarkInput) {
    const s = store();
    const i = s.bookmarks.findIndex(
      (b) =>
        b.sessionId === sessionId &&
        b.targetType === input.targetType &&
        b.targetId === input.targetId,
    );
    if (i < 0) return false;
    s.bookmarks.splice(i, 1);
    return true;
  }

  async listPosts(
    exhibitionId: string,
    opts?: { cursor?: string; limit?: number },
  ): Promise<Paginated<CommunityPost>> {
    const reportCount = new Map<string, number>();
    for (const r of store().reports) {
      reportCount.set(r.postId, (reportCount.get(r.postId) ?? 0) + 1);
    }
    const list = store()
      .posts.filter(
        (p) =>
          p.exhibitionId === exhibitionId &&
          (reportCount.get(p.id) ?? 0) < REPORT_HIDE_THRESHOLD,
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return paginate(list, opts?.cursor, opts?.limit ?? 50);
  }

  async createPost(
    sessionId: string,
    exhibitionId: string,
    input: CommunityPostInput,
  ): Promise<CommunityPost> {
    const post: CommunityPost = {
      id: uid("cp"),
      exhibitionId,
      sessionId,
      authorName: input.authorName,
      body: input.body,
      boothId: input.boothId,
      mediaUrl: input.mediaUrl,
      mediaType: input.mediaType,
      mediaPublicId: input.mediaPublicId,
      createdAt: now(),
    };
    store().posts.push(post);
    return post;
  }

  async getPost(id: string): Promise<CommunityPost | null> {
    return store().posts.find((p) => p.id === id) ?? null;
  }

  async deletePost(id: string, sessionId: string): Promise<DeletePostResult> {
    const posts = store().posts;
    const i = posts.findIndex((p) => p.id === id && p.sessionId === sessionId);
    if (i === -1) return { deleted: false };
    const [removed] = posts.splice(i, 1);
    return {
      deleted: true,
      mediaPublicId: removed.mediaPublicId,
      mediaType: removed.mediaType,
    };
  }

  async reportPost(
    postId: string,
    sessionId: string,
    reason?: string,
  ): Promise<ReportResult> {
    const post = store().posts.find((p) => p.id === postId);
    if (!post) return { ok: false, already: false };
    const reports = store().reports;
    if (reports.some((r) => r.postId === postId && r.sessionId === sessionId)) {
      return { ok: true, already: true };
    }
    reports.push({
      id: uid("rep"),
      postId,
      sessionId,
      reason,
      createdAt: now(),
    });
    return { ok: true, already: false };
  }

  // --- route sharing -------------------------------------------------------

  async publishRoute(
    id: string,
    input: RoutePublishInput & { shareId: string; userId?: string },
  ): Promise<RoutePlan | null> {
    const r = store().routes.find((x) => x.id === id);
    if (!r) return null;
    r.title = input.title;
    r.isPublic = input.isPublic;
    r.shareId = r.shareId ?? input.shareId;
    if (input.userId && !r.userId) r.userId = input.userId;
    return r;
  }

  async getRouteByShareId(shareId: string): Promise<RoutePlan | null> {
    return store().routes.find((r) => r.shareId === shareId) ?? null;
  }

  async listPublicRoutes(exhibitionId: string): Promise<SharedRoute[]> {
    const userById = new Map(store().users.map((u) => [u.id, u]));
    return store()
      .routes.filter(
        (r) => r.exhibitionId === exhibitionId && r.isPublic && r.shareId,
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((r) => ({
        id: r.id,
        shareId: r.shareId!,
        title: r.title ?? "이름 없는 동선",
        exhibitionId: r.exhibitionId,
        ownerNickname: r.userId
          ? (userById.get(r.userId)?.nickname ?? "익명")
          : "익명",
        boothIds: r.boothIds,
        estimatedMinutes: r.estimatedMinutes,
        createdAt: r.createdAt,
      }));
  }

  async boothHeatmap(exhibitionId: string): Promise<{
    booths: Record<string, number>;
    pairs: { from: string; to: string; count: number }[];
  }> {
    const booths: Record<string, number> = {};
    const pairs = new Map<string, number>();
    for (const r of store().routes) {
      if (r.exhibitionId !== exhibitionId) continue;
      const ids = r.boothIds;
      for (const id of ids) booths[id] = (booths[id] ?? 0) + 1;
      for (let i = 1; i < ids.length; i++) {
        const key = `${ids[i - 1]}→${ids[i]}`;
        pairs.set(key, (pairs.get(key) ?? 0) + 1);
      }
    }
    return {
      booths,
      pairs: [...pairs.entries()].map(([k, count]) => {
        const [from, to] = k.split("→");
        return { from, to, count };
      }),
    };
  }

  // --- users (nickname auth) -----------------------------------------------

  async createUser(nickname: string): Promise<User> {
    const user: User = { id: uid("user"), nickname, createdAt: now() };
    store().users.push(user);
    return user;
  }

  async getUser(id: string): Promise<User | null> {
    return store().users.find((u) => u.id === id) ?? null;
  }

  async getUserByNickname(nickname: string): Promise<User | null> {
    const lower = nickname.toLowerCase();
    return (
      store().users.find((u) => u.nickname.toLowerCase() === lower) ?? null
    );
  }

  // --- booth notes ---------------------------------------------------------

  async listNotes(userId: string): Promise<BoothNote[]> {
    return store().notes.filter((n) => n.userId === userId);
  }

  async upsertNote(
    userId: string,
    boothId: string,
    input: BoothNoteInput,
  ): Promise<BoothNote> {
    const s = store();
    let n = s.notes.find((x) => x.userId === userId && x.boothId === boothId);
    if (!n) {
      n = {
        userId,
        boothId,
        status: input.status ?? undefined,
        memo: input.memo,
        photos: input.photos,
        updatedAt: now(),
      };
      s.notes.push(n);
    } else {
      if (input.status !== undefined) n.status = input.status ?? undefined;
      if (input.memo !== undefined) n.memo = input.memo;
      if (input.photos !== undefined) n.photos = input.photos;
      n.updatedAt = now();
    }
    // Drop empty notes so the store stays compact.
    if (!n.status && !n.memo?.trim() && !n.photos?.length) {
      s.notes = s.notes.filter((x) => x !== n);
    }
    return n;
  }

  async recordAnalytics(
    sessionId: string,
    exhibitionId: string,
    input: AnalyticsEventInput,
  ): Promise<void> {
    store().analytics.push({
      id: uid("an"),
      sessionId,
      exhibitionId,
      createdAt: now(),
      ...input,
    });
  }

  async _allAnalytics(exhibitionId: string): Promise<AnalyticsEvent[]> {
    return store().analytics.filter((a) => a.exhibitionId === exhibitionId);
  }

  async analyticsHeatmap(exhibitionId: string) {
    // Combine recorded analytics with synthetic density from booth popularity so
    // the heatmap is meaningful even before live traffic exists.
    const booths = store().booths.filter(
      (b) => b.exhibitionId === exhibitionId,
    );
    const base = booths.map((b) => ({
      x: b.x,
      y: b.y,
      weight: b.popularity / 100,
    }));
    const live = store()
      .analytics.filter(
        (a) => a.exhibitionId === exhibitionId && a.x != null && a.y != null,
      )
      .map((a) => ({ x: a.x!, y: a.y!, weight: 0.5 }));
    return [...base, ...live];
  }

  async analyticsPopular(exhibitionId: string, limit = 10) {
    const booths = store().booths.filter(
      (b) => b.exhibitionId === exhibitionId,
    );
    const an = store().analytics.filter((a) => a.exhibitionId === exhibitionId);
    return booths
      .map((b) => {
        const views = an.filter(
          (a) => a.boothId === b.id && a.type === "view",
        ).length;
        const arrivals = an.filter(
          (a) => a.boothId === b.id && a.type === "booth_arrive",
        ).length;
        // baseline from popularity so the chart isn't empty pre-traffic
        return {
          boothId: b.id,
          name: b.name,
          views: views + Math.round(b.popularity * 1.2),
          arrivals: arrivals + Math.round(b.popularity * 0.4),
        };
      })
      .sort((a, b) => b.views - a.views)
      .slice(0, limit);
  }

  async analyticsFlow(exhibitionId: string) {
    const an = store()
      .analytics.filter(
        (a) =>
          a.exhibitionId === exhibitionId &&
          a.type === "booth_arrive" &&
          a.boothId,
      )
      .sort(
        (a, b) =>
          a.sessionId.localeCompare(b.sessionId) ||
          a.createdAt.localeCompare(b.createdAt),
      );
    const edges = new Map<string, number>();
    for (let i = 1; i < an.length; i++) {
      if (an[i].sessionId !== an[i - 1].sessionId) continue;
      const key = `${an[i - 1].boothId}→${an[i].boothId}`;
      edges.set(key, (edges.get(key) ?? 0) + 1);
    }
    return [...edges.entries()].map(([k, count]) => {
      const [from, to] = k.split("→");
      return { from, to, count };
    });
  }

  async analyticsConversion(exhibitionId: string) {
    const an = store().analytics.filter((a) => a.exhibitionId === exhibitionId);
    const sessions =
      store().sessions.filter((s) => s.exhibitionId === exhibitionId).length ||
      1;
    const prefs = store().preferences.length;
    const routeStart =
      an.filter((a) => a.type === "route_start").length ||
      store().routes.filter((r) => r.exhibitionId === exhibitionId).length;
    const routeDone =
      an.filter((a) => a.type === "route_complete").length ||
      store().routes.filter(
        (r) => r.exhibitionId === exhibitionId && r.status === "completed",
      ).length;
    const stages = [
      { stage: "세션 시작", count: sessions },
      { stage: "온보딩 완료", count: prefs },
      { stage: "경로 시작", count: routeStart },
      { stage: "경로 완료", count: routeDone },
    ];
    const top = stages[0].count || 1;
    return stages.map((s) => ({
      ...s,
      rate: Number(((s.count / top) * 100).toFixed(1)),
    }));
  }
}
