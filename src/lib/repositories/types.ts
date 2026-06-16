import type {
  AnalyticsEvent,
  Booth,
  BoothDetail,
  BoothEvent,
  Bookmark,
  BoothNote,
  Category,
  CommunityPost,
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
  Waiting,
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
  WaitingInput,
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

  // waiting / welcome kit
  getWaiting(boothId: string): Promise<Waiting | null>;
  /** All waiting rows for an exhibition (single batch — avoids per-booth N+1). */
  listWaitings(exhibitionId: string): Promise<Waiting[]>;
  upsertWaiting(boothId: string, input: WaitingInput): Promise<Waiting>;
  getWelcomeKit(boothId: string): Promise<WelcomeKit | null>;
  upsertWelcomeKit(
    boothId: string,
    input: WelcomeKitInput,
  ): Promise<WelcomeKit>;

  // reviews
  listReviews(
    boothId: string,
    opts?: { cursor?: string; limit?: number },
  ): Promise<Paginated<Review> & { summary: { avg: number; count: number } }>;
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
  ): Promise<RoutePlan>;
  getRoute(id: string): Promise<RoutePlan | null>;
  patchRoute(id: string, patch: RoutePatch): Promise<RoutePlan | null>;
  publishRoute(
    id: string,
    input: RoutePublishInput & { shareId: string; userId?: string },
  ): Promise<RoutePlan | null>;
  getRouteByShareId(shareId: string): Promise<RoutePlan | null>;
  listPublicRoutes(exhibitionId: string): Promise<SharedRoute[]>;

  // users (nickname auth)
  createUser(nickname: string): Promise<User>;
  getUser(id: string): Promise<User | null>;
  getUserByNickname(nickname: string): Promise<User | null>;

  // booth notes (signed-in personal records)
  listNotes(userId: string): Promise<BoothNote[]>;
  upsertNote(
    userId: string,
    boothId: string,
    input: BoothNoteInput,
  ): Promise<BoothNote>;

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
