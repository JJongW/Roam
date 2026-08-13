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
  IssueLog,
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
import type { TasteAccuracy } from "@/lib/memory/taste";
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
  /** 전시 slug → id만(전체 상세 없이) — getExhibition()의 halls·categories·booths
   *  병렬조회는 이 용도(클릭 계측 귀속)엔 낭비다. */
  getExhibitionIdBySlug(slug: string): Promise<string | null>;
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

  /** 부스 인기 히트맵. 동선(saved route) 제거로 소스가 없어져 현재는 빈 값 스텁.
   *  지도 히트맵·랭킹 crowd 신호가 소비하나 없으면 0으로 degrade. */
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

  // 오류/이슈 로그 (admin 모니터링)
  /** 서버 또는 클라이언트에서 발생한 오류 이벤트를 적재. 절대 throw하지 않는다 —
   *  로깅 실패가 원래 요청에 영향을 주면 안 된다. */
  logIssue(input: {
    source: "server" | "client";
    message: string;
    stack?: string;
    path?: string;
    digest?: string;
    userId?: string;
    sessionId?: string;
    context?: Record<string, unknown>;
    device?: string;
    country?: string;
    city?: string;
  }): Promise<void>;
  /** 오류 이벤트 최신순 조회(admin 전용). sinceDays를 주면 그 기간 안의 것만. */
  listIssues(opts?: {
    source?: "server" | "client";
    limit?: number;
    sinceDays?: number;
  }): Promise<IssueLog[]>;
  /** olderThanDays보다 오래된 로그를 지운다(admin 수동 정리). 반환값 = 삭제된 행 수. */
  deleteOldIssues(olderThanDays: number): Promise<number>;

  // L4 사용자 메모리 (원장 + 증류 브레인)
  /** 사용자 행동 신호를 원장에 append. 증류는 호출부(memory service)가 수행. */
  appendUserSignal(sig: Omit<UserSignal, "id" | "createdAt">): Promise<void>;
  /** 재증류 소스 — 사용자 신호 로그 조회(최신순). */
  listUserSignals(
    userId: string,
    opts?: { exhibitionId?: string; limit?: number },
  ): Promise<UserSignal[]>;
  /** 전시 전체 사용자 신호 조회(관리자 타임라인용) — userId로 안 좁힘. */
  listExhibitionSignals(
    exhibitionId: string,
    opts?: { limit?: number },
  ): Promise<UserSignal[]>;
  /** 증류된 종단 브레인 조회. 없으면 null. */
  getUserBrain(userId: string): Promise<UserBrain | null>;
  /** 증류된 브레인 upsert. */
  saveUserBrain(brain: UserBrain): Promise<void>;
  /** 이 전시에서 회고(관람 마치기 → VisitDigest)를 남긴 사용자 id 목록.
   *  여정 퍼널의 마지막 단계 소스. */
  listReflectedUserIds(exhibitionId: string): Promise<string[]>;

  // users (nickname + OAuth auth)
  createUser(nickname: string): Promise<User>;
  /** 계정 목록(관리자용, 최신 가입순). */
  listUsers(opts?: { limit?: number; offset?: number }): Promise<User[]>;
  /** 계정 삭제(관리자용). 존재 안 하면 false. */
  deleteUser(id: string): Promise<boolean>;
  getUser(id: string): Promise<User | null>;
  getUserByNickname(nickname: string): Promise<User | null>;
  /** 닉네임 변경(로그인 후 언제든) — 다른 계정이 이미 쓰는 닉네임이면 null.
   *  대소문자 무시 중복 검사는 호출부(route)가 getUserByNickname으로 먼저
   *  한다 — 여기선 그 확인이 끝났다는 전제로 단순 업데이트만 한다. */
  updateNickname(id: string, nickname: string): Promise<User | null>;
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
    /** 이 쓰기의 확신 등급. interest(must·curious·pass) 또는 verdict(good·ok·bad)를
     *  실제로 바꾸는 쓰기일 때만 값(해제면 null)을 준다. undefined면 저장소가 기존
     *  judged_class를 건드리지 않는다(메모·사진만 고치는 등 interest·verdict 자체가
     *  안 바뀌는 쓰기) — 그래야 메모만 고칠 때 이미 답한 판정이 조용히 지워지지 않는다. */
    judgedClass: "confident" | "uncertain" | null | undefined,
  ): Promise<BoothNote>;
  /** 특정 부스 id 목록에 해당하는 모든 사용자의 노트(admin 데이터 이슈 계산용). */
  listNotesByBoothIds(boothIds: string[]): Promise<BoothNote[]>;
  /** 부스 하나(가벼운 조회 — 목록 컬럼 + enrichment). getBoothDetail과 달리
   *  리뷰·이벤트·웰컴키트는 안 읽는다. 반응 판정 시 확신도 대조에 쓴다. */
  getBooth(id: string): Promise<Booth | null>;
  /** 전시 스코프 취향 정확도. */
  getTasteAccuracy(
    userId: string,
    exhibitionId: string,
  ): Promise<TasteAccuracy>;
  /** verdict가 있는데 아직 방문 기록(visitedAt)이 없는 부스는 존재할 수 없다 — verdict
   *  자체가 방문 기록이다(judgment-vocabulary §3-3). 그래서 되묻기 대상은 오직
   *  "visitedAt은 있는데 verdict가 없는" 부스뿐이다(레거시 행 + 현장에서 안 누른 것).
   *  관람 마치기용, 최대 limit개. */
  listPendingRetro(
    userId: string,
    exhibitionId: string,
    limit: number,
  ): Promise<{ boothId: string; boothName: string }[]>;
  /** interest='must'로 찍어뒀는데 아직 안 간(visitedAt 없는) 부스 — 관람 마치기에서
   *  "여기 가봤어?"로 단정 없이 묻는 두 번째 되묻기 묶음(judgment-vocabulary §7-2).
   *  최대 limit개. */
  listMustNotVisited(
    userId: string,
    exhibitionId: string,
    limit: number,
  ): Promise<{ boothId: string; boothName: string }[]>;
  /** Every visitor memo for booths in this exhibition (boothId + memo text).
   *  Powers crowd-sourced keyword extraction for onboarding. */
  listExhibitionNotes(
    exhibitionId: string,
  ): Promise<{ boothId: string; memo: string }[]>;

  // bookmarks
  listBookmarks(userId: string): Promise<Bookmark[]>;
  addBookmark(userId: string, input: BookmarkInput): Promise<Bookmark>;
  removeBookmark(userId: string, input: BookmarkInput): Promise<boolean>;

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
