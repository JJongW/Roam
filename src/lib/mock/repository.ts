import { uid, shortId } from "@/lib/utils";
import { REPORT_HIDE_THRESHOLD } from "@/lib/constants";
import { freshSeed } from "@/lib/mock/seed";
import {
  sifExhibition,
  sifHalls,
  sifCategories,
  sifBooths,
} from "@/lib/mock/seed-sif";
import {
  haExhibition,
  haHalls,
  haCategories,
  haBooths,
} from "@/lib/mock/seed-house-archive";
import { computeTasteAccuracy, type TasteAccuracy } from "@/lib/memory/taste";
import { computeJourneyFunnel } from "@/lib/admin/journey-funnel";
import type { ListBoothQuery, Repository } from "@/lib/repositories/types";
import type {
  AiQueryLog,
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
  IssueLog,
  Paginated,
  Review,
  RoutePlan,
  SharedRoute,
  User,
  OAuthIdentity,
  UserBrain,
  UserPreference,
  UserSignal,
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
  // providerAccountId links an OAuth account for getUserByProvider lookups;
  // it is internal and never surfaced on the public User shape.
  users: (User & { providerAccountId?: string })[];
  notes: BoothNote[];
  analytics: AnalyticsEvent[];
  aiQueries: AiQueryLog[];
  userSignals: UserSignal[];
  userBrains: Map<string, UserBrain>;
  issueLogs: IssueLog[];
}

// Persist across HMR / route invocations in a single Node process.
const g = globalThis as unknown as { __roamStore?: Store };

function buildStore(): Store {
  const s = freshSeed();
  return {
    // SIBF + SIF 공존(멀티 전시). 홀·카테고리·부스는 exhibitionId로 구분돼 섞여도 안전.
    exhibitions: [
      s.exhibition,
      structuredClone(sifExhibition),
      structuredClone(haExhibition),
    ],
    halls: [
      ...s.halls,
      ...structuredClone(sifHalls),
      ...structuredClone(haHalls),
    ],
    categories: [
      ...s.categories,
      ...structuredClone(sifCategories),
      ...structuredClone(haCategories),
    ],
    booths: [
      ...s.booths,
      ...structuredClone(sifBooths),
      ...structuredClone(haBooths),
    ],
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
    aiQueries: [],
    userSignals: [],
    userBrains: new Map(),
    issueLogs: [],
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
    // 멀티 전시: 카테고리를 이 전시 부스가 실제 쓰는 것만 노출(전시 간 누수 방지).
    const usedCatIds = new Set(
      store()
        .booths.filter((b) => b.exhibitionId === exhibition.id)
        .map((b) => b.categoryId),
    );
    return {
      exhibition,
      halls: store()
        .halls.filter((h) => h.exhibitionId === exhibition.id)
        .sort((a, b) => a.sort - b.sort),
      categories: store().categories.filter((c) => usedCatIds.has(c.id)),
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
    return {
      booth,
      category,
      welcomeKit: store().welcomeKits.find((w) => w.boothId === id),
      events: store()
        .events.filter((e) => e.boothId === id)
        .sort((a, b) => a.startTime.localeCompare(b.startTime)),
      reviews,
      reviewSummary: { count },
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
    return {
      ...paginate(all, opts?.cursor, opts?.limit),
      summary: { count },
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

  async listBookmarks(userId: string) {
    return store().bookmarks.filter((b) => b.userId === userId);
  }

  async addBookmark(userId: string, input: BookmarkInput): Promise<Bookmark> {
    const s = store();
    const existing = s.bookmarks.find(
      (b) =>
        b.userId === userId &&
        b.targetType === input.targetType &&
        b.targetId === input.targetId,
    );
    if (existing) return existing;
    const bm: Bookmark = {
      id: uid("bm"),
      userId,
      createdAt: now(),
      ...input,
    };
    s.bookmarks.push(bm);
    return bm;
  }

  async removeBookmark(userId: string, input: BookmarkInput) {
    const s = store();
    const i = s.bookmarks.findIndex(
      (b) =>
        b.userId === userId &&
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

  async listUsers(opts?: { limit?: number; offset?: number }): Promise<User[]> {
    const rows = [...store().users].sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    );
    const offset = opts?.offset ?? 0;
    const sliced = rows.slice(offset);
    return opts?.limit ? sliced.slice(0, opts.limit) : sliced;
  }

  async deleteUser(id: string): Promise<boolean> {
    const s = store();
    const i = s.users.findIndex((u) => u.id === id);
    if (i < 0) return false;
    s.users.splice(i, 1);
    return true;
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

  async getUserByProvider(
    provider: string,
    providerAccountId: string,
  ): Promise<User | null> {
    return (
      store().users.find(
        (u) =>
          u.provider === provider && u.providerAccountId === providerAccountId,
      ) ?? null
    );
  }

  async createOAuthUser(identity: OAuthIdentity): Promise<User> {
    const user: User = {
      id: uid("user"),
      nickname: identity.nickname,
      createdAt: now(),
      provider: identity.provider,
      email: identity.email,
      avatarUrl: identity.avatarUrl,
    };
    // Mock store keeps the provider link on the record for lookup.
    store().users.push({
      ...user,
      providerAccountId: identity.providerAccountId,
    } as User & { providerAccountId: string });
    return user;
  }

  // --- booth notes ---------------------------------------------------------

  async listNotes(userId: string): Promise<BoothNote[]> {
    return store().notes.filter((n) => n.userId === userId);
  }

  async upsertNote(
    userId: string,
    boothId: string,
    input: BoothNoteInput,
    judgedClass: "confident" | "uncertain" | null | undefined,
  ): Promise<BoothNote> {
    const s = store();
    let n = s.notes.find((x) => x.userId === userId && x.boothId === boothId);
    if (!n) {
      n = {
        userId,
        boothId,
        interest: input.interest ?? undefined,
        verdict: input.verdict ?? undefined,
        // verdict를 새로 쓰는 순간이 곧 방문 시각이다. 해제(verdict===null)면 같이 지운다.
        visitedAt:
          input.verdict !== undefined
            ? input.verdict
              ? now()
              : undefined
            : undefined,
        memo: input.memo,
        photos: input.photos,
        judgedClass:
          judgedClass === undefined ? undefined : (judgedClass ?? undefined),
        updatedAt: now(),
      };
      s.notes.push(n);
    } else {
      if (input.interest !== undefined)
        n.interest = input.interest ?? undefined;
      if (input.verdict !== undefined) {
        n.verdict = input.verdict ?? undefined;
        n.visitedAt = input.verdict ? now() : undefined;
      }
      if (input.memo !== undefined) n.memo = input.memo;
      if (input.photos !== undefined) n.photos = input.photos;
      // Supabase 구현과 같은 규칙: judgedClass가 undefined면 판정 필드를 안 건드린다.
      if (judgedClass !== undefined) {
        n.judgedClass = judgedClass ?? undefined;
      }
      n.updatedAt = now();
    }
    // Drop empty notes so the store stays compact.
    if (!n.interest && !n.verdict && !n.memo?.trim() && !n.photos?.length) {
      s.notes = s.notes.filter((x) => x !== n);
    }
    return n;
  }

  async listNotesByBoothIds(boothIds: string[]): Promise<BoothNote[]> {
    const ids = new Set(boothIds);
    return store().notes.filter((n) => ids.has(n.boothId));
  }

  async getBooth(id: string): Promise<Booth | null> {
    const s = store();
    return s.booths.find((b) => b.id === id) ?? null;
  }

  async getTasteAccuracy(
    userId: string,
    exhibitionId: string,
  ): Promise<TasteAccuracy> {
    const s = store();
    const boothIds = new Set(
      s.booths.filter((b) => b.exhibitionId === exhibitionId).map((b) => b.id),
    );
    const notes = s.notes.filter(
      (n) => n.userId === userId && boothIds.has(n.boothId),
    );
    return computeTasteAccuracy(
      notes.map((n) => ({
        interest: n.interest,
        verdict: n.verdict,
        judgedClass: n.judgedClass,
      })),
    );
  }

  async listPendingRetro(
    userId: string,
    exhibitionId: string,
    limit: number,
  ): Promise<{ boothId: string; boothName: string }[]> {
    const s = store();
    const boothById = new Map(
      s.booths
        .filter((b) => b.exhibitionId === exhibitionId)
        .map((b) => [b.id, b]),
    );
    return s.notes
      .filter(
        (n) =>
          n.userId === userId &&
          n.visitedAt &&
          !n.verdict &&
          boothById.has(n.boothId),
      )
      .slice(0, limit)
      .map((n) => ({
        boothId: n.boothId,
        boothName: boothById.get(n.boothId)!.name,
      }));
  }

  async listMustNotVisited(
    userId: string,
    exhibitionId: string,
    limit: number,
  ): Promise<{ boothId: string; boothName: string }[]> {
    const s = store();
    const boothById = new Map(
      s.booths
        .filter((b) => b.exhibitionId === exhibitionId)
        .map((b) => [b.id, b]),
    );
    return s.notes
      .filter(
        (n) =>
          n.userId === userId &&
          n.interest === "must" &&
          !n.visitedAt &&
          boothById.has(n.boothId),
      )
      .slice(0, limit)
      .map((n) => ({
        boothId: n.boothId,
        boothName: boothById.get(n.boothId)!.name,
      }));
  }

  async listExhibitionNotes(
    exhibitionId: string,
  ): Promise<{ boothId: string; memo: string }[]> {
    const boothIds = new Set(
      store()
        .booths.filter((b) => b.exhibitionId === exhibitionId)
        .map((b) => b.id),
    );
    return store()
      .notes.filter((n) => n.memo?.trim() && boothIds.has(n.boothId))
      .map((n) => ({ boothId: n.boothId, memo: n.memo! }));
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

  async logAiQuery(
    sessionId: string,
    exhibitionId: string,
    input: { text: string; keywords: string[] },
  ): Promise<void> {
    const q: AiQueryLog = {
      id: uid("aq"),
      exhibitionId,
      sessionId,
      text: input.text,
      keywords: input.keywords,
      createdAt: now(),
    };
    store().aiQueries.push(q);
  }

  async topQueryKeywords(
    exhibitionId: string,
    limit = 12,
  ): Promise<{ keyword: string; count: number }[]> {
    const counts = new Map<string, number>();
    for (const q of store().aiQueries) {
      if (q.exhibitionId !== exhibitionId) continue;
      for (const k of q.keywords) {
        const key = k.trim();
        if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .map(([keyword, count]) => ({ keyword, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  async logIssue(input: {
    source: "server" | "client";
    message: string;
    stack?: string;
    path?: string;
    digest?: string;
    userId?: string;
    sessionId?: string;
    context?: Record<string, unknown>;
  }): Promise<void> {
    store().issueLogs.push({
      id: uid("issue"),
      source: input.source,
      message: input.message,
      stack: input.stack,
      path: input.path,
      digest: input.digest,
      userId: input.userId,
      sessionId: input.sessionId,
      context: input.context,
      createdAt: now(),
    });
  }

  async listIssues(opts?: {
    source?: "server" | "client";
    limit?: number;
  }): Promise<IssueLog[]> {
    let list = [...store().issueLogs].reverse();
    if (opts?.source) list = list.filter((i) => i.source === opts.source);
    return list.slice(0, opts?.limit ?? 100);
  }

  async appendUserSignal(
    sig: Omit<UserSignal, "id" | "createdAt">,
  ): Promise<void> {
    store().userSignals.push({ ...sig, id: uid("sig"), createdAt: now() });
  }

  async listUserSignals(
    userId: string,
    opts?: { exhibitionId?: string; limit?: number },
  ): Promise<UserSignal[]> {
    let rows = store()
      .userSignals.filter((s) => s.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    if (opts?.exhibitionId) {
      rows = rows.filter((s) => s.exhibitionId === opts.exhibitionId);
    }
    return opts?.limit ? rows.slice(0, opts.limit) : rows;
  }

  async listExhibitionSignals(
    exhibitionId: string,
    opts?: { limit?: number },
  ): Promise<UserSignal[]> {
    const rows = store()
      .userSignals.filter((s) => s.exhibitionId === exhibitionId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return opts?.limit ? rows.slice(0, opts.limit) : rows;
  }

  async getUserBrain(userId: string): Promise<UserBrain | null> {
    return store().userBrains.get(userId) ?? null;
  }

  async saveUserBrain(brain: UserBrain): Promise<void> {
    store().userBrains.set(brain.userId, brain);
  }

  async listReflectedUserIds(exhibitionId: string): Promise<string[]> {
    const ids: string[] = [];
    for (const brain of store().userBrains.values()) {
      if (brain.visits.some((v) => v.exhibitionId === exhibitionId)) {
        ids.push(brain.userId);
      }
    }
    return ids;
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
    // 정적 popularity 가산을 뺐다 — 실제 조회가 없으면 정직하게 0으로 보인다.
    // arrivals는 여전히 booth_arrive 발화가 없어 0이다(구조적 해결 전까지는
    // 그렇게 정직하게 보이는 게 옳다 — admin-analytics-pm-layer §1).
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
        return { boothId: b.id, name: b.name, views, arrivals };
      })
      .sort((a, b) => b.views - a.views)
      .slice(0, limit);
  }

  async analyticsFlow(exhibitionId: string) {
    // booth_arrive는 발화가 없다(동선 제품 제거) — 유일하게 살아있는 view를
    // 같은 세션 안에서 시간순으로 이어 "부스 상세를 연달아 본 흐름"으로
    // 근사한다(admin-analytics-pm-layer §1, 구조적 해결 전까지의 근사).
    const an = store()
      .analytics.filter(
        (a) =>
          a.exhibitionId === exhibitionId && a.type === "view" && a.boothId,
      )
      .sort(
        (a, b) =>
          a.sessionId.localeCompare(b.sessionId) ||
          a.createdAt.localeCompare(b.createdAt),
      );
    const edges = new Map<string, number>();
    const MAX_GAP_MS = 30 * 60 * 1000;
    for (let i = 1; i < an.length; i++) {
      if (an[i].sessionId !== an[i - 1].sessionId) continue;
      if (an[i].boothId === an[i - 1].boothId) continue;
      const gap =
        new Date(an[i].createdAt).getTime() -
        new Date(an[i - 1].createdAt).getTime();
      // 세션 쿠키가 30일까지 살아있어 같은 세션이라도 며칠 뒤 재방문이 섞일 수
      // 있다 — 실제 한 번의 관람 흐름만 잡히게 시간 간격도 좁힌다.
      if (gap > MAX_GAP_MS) continue;
      const key = `${an[i - 1].boothId}→${an[i].boothId}`;
      edges.set(key, (edges.get(key) ?? 0) + 1);
    }
    return [...edges.entries()].map(([k, count]) => {
      const [from, to] = k.split("→");
      return { from, to, count };
    });
  }

  async analyticsConversion(exhibitionId: string) {
    // 죽은 소스(user_preference·route_plan)를 읽던 걸 실제 여정 퍼널로 교체한다
    // (admin-analytics-pm-layer §2-1). Stream B(user_signal_log)가 유일하게
    // "누가 뭘 했는지" 아는 소스다.
    const signals = await this.listExhibitionSignals(exhibitionId);
    const reflected = await this.listReflectedUserIds(exhibitionId);
    return computeJourneyFunnel(signals, new Set(reflected));
  }
}
