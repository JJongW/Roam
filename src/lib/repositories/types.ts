import type {
  AnalyticsEvent,
  Booth,
  BoothDetail,
  BoothEvent,
  Bookmark,
  BoothNote,
  Category,
  CommunityPost,
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
  OAuthIdentity,
  UserBrain,
  UserSignal,
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
  RouteInput,
  RoutePatch,
  RoutePublishInput,
  UserPreferenceInput,
  WelcomeKitInput,
} from "@/lib/schemas";

export interface ListBoothQuery {
  hallId?: string;
  categoryId?: string;
  q?: string;
  cursor?: string;
  limit?: number;
}

export interface Repository {
  mode: "mock" | "supabase";

  // exhibitions
  listExhibitions(opts?: {
    cursor?: string;
    limit?: number;
  }): Promise<Paginated<Exhibition>>;
  getExhibition(slug: string): Promise<ExhibitionDetail | null>;
  createExhibition(input: ExhibitionInput): Promise<Exhibition>;
  updateExhibition(
    id: string,
    input: Partial<ExhibitionInput>,
  ): Promise<Exhibition | null>;
  deleteExhibition(id: string): Promise<boolean>;

  // booths
  listBooths(slug: string, query?: ListBoothQuery): Promise<Paginated<Booth>>;
  listBoothsByExhibitionId(exhibitionId: string): Promise<Booth[]>;
  getBoothDetail(id: string): Promise<BoothDetail | null>;
  createBooth(input: BoothInput): Promise<Booth>;
  updateBooth(id: string, input: Partial<BoothInput>): Promise<Booth | null>;
  deleteBooth(id: string): Promise<boolean>;

  // categories / halls
  listCategories(exhibitionId: string): Promise<Category[]>;
  listHalls(exhibitionId: string): Promise<Hall[]>;

  // events
  listEvents(
    slug: string,
    opts?: { boothId?: string; from?: string; to?: string },
  ): Promise<BoothEvent[]>;
  createEvent(input: EventInput): Promise<BoothEvent>;
  updateEvent(
    id: string,
    input: Partial<EventInput>,
  ): Promise<BoothEvent | null>;
  deleteEvent(id: string): Promise<boolean>;

  // welcome kit
  getWelcomeKit(boothId: string): Promise<WelcomeKit | null>;
  upsertWelcomeKit(
    boothId: string,
    input: WelcomeKitInput,
  ): Promise<WelcomeKit>;

  // reviews
  listReviews(
    boothId: string,
    opts?: { cursor?: string; limit?: number },
  ): Promise<Paginated<Review> & { summary: { count: number } }>;
  createReview(
    boothId: string,
    sessionId: string,
    input: ReviewInput,
  ): Promise<Review>;

  // sessions / preference
  createSession(exhibitionId: string): Promise<VisitorSession>;
  getSession(id: string): Promise<VisitorSession | null>;
  getPreference(sessionId: string): Promise<UserPreference | null>;
  savePreference(
    sessionId: string,
    input: UserPreferenceInput,
  ): Promise<UserPreference>;

  // route
  saveRoute(
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
  ): Promise<RoutePlan>;
  getRoute(id: string): Promise<RoutePlan | null>;
  patchRoute(id: string, patch: RoutePatch): Promise<RoutePlan | null>;
  /** The caller's own named (saved) routes, newest first. */
  listMyRoutes(owner: {
    sessionId: string;
    userId?: string;
  }): Promise<RoutePlan[]>;
  /** Delete a route the caller owns. Returns false if missing or not owned. */
  deleteRoute(
    id: string,
    owner: { sessionId: string; userId?: string },
  ): Promise<boolean>;
  publishRoute(
    id: string,
    input: RoutePublishInput & { shareId: string; userId?: string },
  ): Promise<RoutePlan | null>;
  getRouteByShareId(shareId: string): Promise<RoutePlan | null>;
  listPublicRoutes(exhibitionId: string): Promise<SharedRoute[]>;
  /** Aggregate popularity from every saved route in the exhibition: how often
   *  each booth is included, and how often each consecutive booth pair (a
   *  corridor) is walked. Powers the map heatmap. */
  boothHeatmap(exhibitionId: string): Promise<{
    booths: Record<string, number>;
    pairs: { from: string; to: string; count: number }[];
  }>;

  // AI 추천 쿼리 로그 (RAG / 트렌딩 키워드 추적)
  /** AI 추천 채팅창 입력 텍스트 + 추출 키워드를 적재. */
  logAiQuery(
    sessionId: string,
    exhibitionId: string,
    input: { text: string; keywords: string[] },
  ): Promise<void>;
  /** 전시별 누적 쿼리에서 자주 나온 키워드 상위 N개(빈도순). */
  topQueryKeywords(
    exhibitionId: string,
    limit?: number,
  ): Promise<{ keyword: string; count: number }[]>;

  // L4 사용자 메모리 (원장 + 증류 브레인)
  /** 사용자 행동 신호를 원장에 append. 증류는 호출부(memory service)가 수행. */
  appendUserSignal(sig: Omit<UserSignal, "id" | "createdAt">): Promise<void>;
  /** 재증류 소스 — 사용자 신호 로그 조회(최신순). */
  listUserSignals(
    userId: string,
    opts?: { exhibitionId?: string; limit?: number },
  ): Promise<UserSignal[]>;
  /** 증류된 종단 브레인 조회. 없으면 null. */
  getUserBrain(userId: string): Promise<UserBrain | null>;
  /** 증류된 브레인 upsert. */
  saveUserBrain(brain: UserBrain): Promise<void>;

  // users (nickname + OAuth auth)
  createUser(nickname: string): Promise<User>;
  getUser(id: string): Promise<User | null>;
  getUserByNickname(nickname: string): Promise<User | null>;
  /** Find an OAuth-linked account by provider identity, or null. */
  getUserByProvider(
    provider: string,
    providerAccountId: string,
  ): Promise<User | null>;
  /** Create an account linked to an OAuth identity (nickname pre-deduped). */
  createOAuthUser(identity: OAuthIdentity): Promise<User>;

  // booth notes (signed-in personal records)
  listNotes(userId: string): Promise<BoothNote[]>;
  upsertNote(
    userId: string,
    boothId: string,
    input: BoothNoteInput,
  ): Promise<BoothNote>;
  /** Every visitor memo for booths in this exhibition (boothId + memo text).
   *  Powers crowd-sourced keyword extraction for onboarding. */
  listExhibitionNotes(
    exhibitionId: string,
  ): Promise<{ boothId: string; memo: string }[]>;

  // bookmarks
  listBookmarks(sessionId: string): Promise<Bookmark[]>;
  addBookmark(sessionId: string, input: BookmarkInput): Promise<Bookmark>;
  removeBookmark(sessionId: string, input: BookmarkInput): Promise<boolean>;

  // community
  listPosts(
    exhibitionId: string,
    opts?: { cursor?: string; limit?: number },
  ): Promise<Paginated<CommunityPost>>;
  createPost(
    sessionId: string,
    exhibitionId: string,
    input: CommunityPostInput,
  ): Promise<CommunityPost>;
  getPost(id: string): Promise<CommunityPost | null>;
  /**
   * Delete a post only if it belongs to the given session. Returns whether a
   * row was removed, plus any attached media so the caller can clean it up.
   */
  deletePost(id: string, sessionId: string): Promise<DeletePostResult>;
  /**
   * Report a post for abuse. Deduped per reporter session. Once
   * REPORT_HIDE_THRESHOLD distinct sessions report it, listPosts hides it.
   */
  reportPost(
    postId: string,
    sessionId: string,
    reason?: string,
  ): Promise<ReportResult>;

  // analytics
  recordAnalytics(
    sessionId: string,
    exhibitionId: string,
    input: AnalyticsEventInput,
  ): Promise<void>;
  analyticsHeatmap(
    exhibitionId: string,
  ): Promise<{ x: number; y: number; weight: number }[]>;
  analyticsPopular(
    exhibitionId: string,
    limit?: number,
  ): Promise<
    { boothId: string; name: string; views: number; arrivals: number }[]
  >;
  analyticsFlow(
    exhibitionId: string,
  ): Promise<{ from: string; to: string; count: number }[]>;
  analyticsConversion(
    exhibitionId: string,
  ): Promise<{ stage: string; count: number; rate: number }[]>;
  _allAnalytics?(exhibitionId: string): Promise<AnalyticsEvent[]>;
}
