// ---------------------------------------------------------------------------
// Roam domain types. Mirrors .claude/plans/erd.md. Single source for the app.
// ---------------------------------------------------------------------------

export const VISIT_PURPOSES = [
  "purchase",
  "information",
  "networking",
  "experience",
] as const;
export type VisitPurpose = (typeof VISIT_PURPOSES)[number];

export const MOVEMENT_PREFERENCES = [
  "shortest",
  "balanced",
  "thorough",
] as const;
export type MovementPreference = (typeof MOVEMENT_PREFERENCES)[number];

export const COMPANION_TYPES = [
  "alone",
  "partner",
  "family",
  "group",
  "business",
] as const;
export type CompanionType = (typeof COMPANION_TYPES)[number];

/** Visitor age group — collected in onboarding (alongside interests + purpose). */
export const AGE_GROUPS = ["10s", "20s", "30s", "40s", "50s+"] as const;
export type AgeGroup = (typeof AGE_GROUPS)[number];

export const ROUTE_STATUSES = ["active", "completed", "abandoned"] as const;
export type RouteStatus = (typeof ROUTE_STATUSES)[number];

export const BOOKMARK_TARGETS = ["booth", "event"] as const;
export type BookmarkTarget = (typeof BOOKMARK_TARGETS)[number];

export const ANALYTICS_TYPES = [
  "view",
  "dwell",
  "route_start",
  "route_complete",
  "booth_arrive",
  "event_bookmark",
] as const;
export type AnalyticsType = (typeof ANALYTICS_TYPES)[number];

export interface Point {
  x: number;
  y: number;
}

export interface ExhibitionTips {
  transportation?: string;
  parking?: string;
  ticket?: string;
  guide?: string;
}

export interface Exhibition {
  id: string;
  slug: string;
  name: string;
  venue: string;
  description: string;
  startDate: string; // ISO date
  endDate: string;
  coverImageUrl?: string;
  mapImageUrl?: string;
  mapWidth: number;
  mapHeight: number;
  tips: ExhibitionTips;
  organizerId?: string;
  createdAt: string;
}

export interface Hall {
  id: string;
  exhibitionId: string;
  name: string;
  floor: number;
  sort: number;
}

export interface Category {
  id: string;
  slug: string;
  name: string;
  color: string;
  icon: string; // lucide icon name
}

export interface Booth {
  id: string;
  exhibitionId: string;
  hallId: string;
  categoryId: string;
  /** Stand number on the printed floorplan (e.g. "A06"). Optional. */
  code?: string;
  /** "exhibitor" (default) or "facility" — lounge/stage/aux areas that are on
   *  the map but aren't participating publishers, so they stay out of
   *  recommendation, swipe, and screenshot matching. */
  kind?: "exhibitor" | "facility";
  name: string;
  company: string;
  /** Co-located exhibitors sharing this booth code (e.g. a country pavilion or
   *  a shared indie stand). Surfaced in search + screenshot matching so any of
   *  them resolves to this booth, even though the map shows one name. */
  aliases?: string[];
  description: string;
  longDescription: string;
  images: string[];
  logoUrl?: string;
  /** Outbound links surfaced on the booth detail + map (feature: detail from map). */
  instagramUrl?: string;
  websiteUrl?: string;
  tags: string[]; // category slugs used for scoring
  x: number;
  y: number;
  /** 부스 크기로 추정한 체류 시간(분). floorplan 면적에서 런타임 주입(small 3 /
   *  large 10). 동선 시간예산·소요시간 계산에 쓰인다. 없으면 BASE_DWELL_MINUTES. */
  dwellMinutes?: number;
  popularity: number; // 0..100
  /** 수동 주입한 추가정보(굿즈·테마·팁). booth_enrichment 테이블에 보관하고
   *  부스에 붙여 노출한다. themeTags(=카테고리 slug)는 seed 시 tags에도 병합돼
   *  추천 스코어링에 LLM 없이 반영된다. */
  enrichment?: BoothEnrichment;
  createdAt: string;
}

/**
 * 운영자/사용자가 인스타·현장에서 보고 손으로 옮겨 적은 부스 추가정보.
 * 추출(자연어→태그)은 주입 시점 1회. 추천 때는 저장된 값만 읽어 즉시 사용.
 */
export interface BoothEnrichment {
  /** 굿즈·상품 키워드(자유어, 한국어). 상세 표시 + 검색 + 추론 어휘. */
  goodsKeywords: string[];
  /** 테마 태그 — 카테고리 slug. seed 시 Booth.tags에 병합돼 스코어링에 반영. */
  themeTags: string[];
  /** 한 줄 요약. */
  summary?: string;
  /** 대기·위치·추천 시간대 등 현장 팁. */
  tips?: string;
  /** 출처(인스타/웹 URL). */
  sourceUrl?: string;
}

export interface BoothEvent {
  id: string;
  boothId: string;
  title: string;
  description: string;
  startTime: string; // ISO
  endTime: string;
  rewardInfo?: string;
  capacity?: number;
  /** Program type chip (이벤트 / 저자 사인회 / 주제강연 …). */
  tag?: string;
  /** Lecture subtitle / 부주제. */
  subtitle?: string;
  /** 강연자 / presenter line. */
  speaker?: string;
  /** Runs the whole fair (상시) rather than at a fixed slot — UI shows "상시". */
  standing?: boolean;
}

export interface WelcomeKit {
  boothId: string;
  enabled: boolean;
  name: string;
  description: string;
  imageUrl?: string;
  remainingCount: number;
}

export interface Review {
  id: string;
  boothId: string;
  sessionId: string;
  comment: string;
  authorName: string;
  createdAt: string;
}

export interface UserPreference {
  sessionId: string;
  /** One or more visit goals — the route weighs every selected purpose. */
  visitPurposes: VisitPurpose[];
  interests: string[]; // category slugs
  availableMinutes: number;
  movementPreference: MovementPreference;
  companionType: CompanionType;
  updatedAt: string;
}

export interface VisitorSession {
  id: string;
  exhibitionId: string;
  createdAt: string;
  lastSeenAt: string;
}

export interface RouteLeg {
  from: string; // boothId or "start"
  to: string; // boothId
  minutes: number;
  distance: number;
}

export interface RoutePlan {
  id: string;
  sessionId: string;
  /** Owner once the visitor has signed in (nickname account). */
  userId?: string;
  exhibitionId: string;
  boothIds: string[];
  estimatedMinutes: number;
  legs: RouteLeg[];
  scores: Record<string, number>;
  status: RouteStatus;
  currentBoothId?: string;
  visitedBoothIds: string[];
  /** Sharing: published to the public gallery / shareable link. */
  title?: string;
  isPublic: boolean;
  shareId?: string;
  createdAt: string;
}

/**
 * A visitor identity. Nickname is unique and used as the public key. An account
 * may originate from a nickname (provider undefined) or from an OAuth provider
 * (e.g. "google"); OAuth accounts still carry an auto-generated unique nickname.
 */
export interface User {
  id: string;
  nickname: string;
  createdAt: string;
  /** OAuth provider slug (e.g. "google"), or undefined for nickname-only. */
  provider?: string;
  email?: string;
  avatarUrl?: string;
}

/** Identity read from an OAuth provider, used to find-or-create an app_user. */
export interface OAuthIdentity {
  provider: string;
  providerAccountId: string;
  nickname: string;
  email?: string;
  avatarUrl?: string;
}

/** A signed-in visitor's personal record for a booth (visited / skip / memo). */
export interface BoothNote {
  userId: string;
  boothId: string;
  status?: "visited" | "skipped";
  memo?: string;
  /** Personal photos (Cloudinary URLs) attached to this booth note. */
  photos?: string[];
  updatedAt: string;
}

/** Public-gallery / shared-link projection of a route. */
export interface SharedRoute {
  id: string;
  shareId: string;
  title: string;
  exhibitionId: string;
  ownerNickname: string;
  boothIds: string[];
  estimatedMinutes: number;
  createdAt: string;
}

export interface Bookmark {
  id: string;
  sessionId: string;
  targetType: BookmarkTarget;
  targetId: string;
  createdAt: string;
}

export interface AnalyticsEvent {
  id: string;
  sessionId: string;
  exhibitionId: string;
  type: AnalyticsType;
  boothId?: string;
  x?: number;
  y?: number;
  meta?: Record<string, unknown>;
  createdAt: string;
}

/**
 * 지도 "AI 추천" 채팅창에 사용자가 입력한 자유 텍스트 로그. 누적해서 자주 나오는
 * 키워드를 추적하고(RAG), 이후 추천 프롬프트에 트렌딩 신호로 주입한다.
 */
export interface AiQueryLog {
  id: string;
  exhibitionId: string;
  sessionId: string;
  text: string;
  /** LLM이 그 쿼리에서 뽑은 대표 키워드(빈도 집계의 단위). */
  keywords: string[];
  createdAt: string;
}

// --- L4 사용자 브레인 (종단 메모리) ------------------------------------------
// 원장(UserSignal) → 결정론 증류(confidence 수학, LLM 무) → per-user 브레인(UserBrain).
// userId = app_user.id. 설계: docs/decisions/2026-07-07_knowledge-architecture.md §7

export type SignalKind =
  "booth_visited" | "booth_skipped" | "booth_bookmarked" | "route_saved";

/** 원장 1행 — 사용자 행동 신호. append-only, 재증류 소스. */
export interface UserSignal {
  id: string;
  userId: string;
  exhibitionId: string;
  kind: SignalKind;
  /** 신호를 유발한 부스(있으면). */
  boothCode?: string;
  /** 관심 이전축 = category slug. 부스 tags에서 확장. */
  slugs: string[];
  createdAt: string;
}

/** 증류된 관심 노드 — category slug 단위, confidence 있는. */
export interface InterestNode {
  key: string; // category slug (이전축)
  label: string;
  confidence: number; // 0..1
  signals: { explicit: number; implicit: number; negative: number };
  firstSeenAt: string;
  lastSeenAt: string;
  trend: "up" | "flat" | "down";
}

/** 관람 1회의 약속(개인 목표). 이번 슬라이스 미사용 — 스키마만. */
export interface GoalRecord {
  exhibitionId: string;
  visitId: string;
  statement: string;
  themes: string[]; // category slug[]
  timeBudgetMin: number;
  status: "set" | "met" | "partial" | "missed";
  metRatio: number; // 분모 프레이밍: 관련집합 대비
  createdAt: string;
  closedAt?: string;
}

/** L3 에피소드 → 증류본. 이번 슬라이스 미사용 — 스키마만. */
export interface VisitDigest {
  exhibitionId: string;
  visitId: string;
  date: string;
  boothsVisited: string[]; // booth code[]
  themesEngaged: string[]; // category slug[]
  highlights: string[]; // 자발(메모·사진) + 자동(순간) 합성
  satisfaction?: number; // 0..1 회고 신호
  summary: string; // 결정론 1줄 요약(항상 존재)
  /** Companion(LLM)이 쓴 따뜻한 회고 서술. 조회 시 lazy 생성·캐시. 없으면 summary. */
  narrative?: string;
}

/** per-user 종단 모델 — 증류본(원장 아님). LLM 주입 시 요약해 전달. */
export interface UserBrain {
  userId: string;
  version: number;
  updatedAt: string;
  /** 안목(학습도) — 성장 지표. 초보→고관여 UX 구동. */
  literacy: {
    overall: number; // 0..1
    byTheme: Record<string, number>; // slug → 0..1
    visitsCount: number;
    boothsSeenCount: number;
  };
  interests: InterestNode[]; // top-N만 유지(증류)
  preferences: {
    movement?: MovementPreference;
    companion?: CompanionType;
    crowdTolerance?: number; // 0..1 (낮을수록 회피)
    waitTolerance?: number; // 0..1
    depthVsBreadth?: number; // 0=깊게 1=넓게
  };
  goals: GoalRecord[];
  visits: VisitDigest[];
  health: {
    lastDistilledAt: string;
    decayHalfLifeDays: number;
  };
}

export interface Organizer {
  id: string;
  email: string;
  name: string;
  createdAt: string;
}

/** A real-time community post visitors share during the exhibition. */
export interface CommunityPost {
  id: string;
  exhibitionId: string;
  sessionId: string;
  authorName: string;
  body: string;
  boothId?: string; // optional booth the post is about
  /** Attached photo / short clip (display-only, Cloudinary). */
  mediaUrl?: string;
  mediaType?: "image" | "video";
  mediaPublicId?: string;
  createdAt: string;
}

/** An abuse report against a community post (deduped per reporter session). */
export interface CommunityReport {
  id: string;
  postId: string;
  sessionId: string;
  reason?: string;
  createdAt: string;
}

/** Result of reporting a post. `ok` is false only when the post is missing. */
export interface ReportResult {
  ok: boolean;
  /** This session had already reported the post (idempotent). */
  already: boolean;
}

/**
 * Result of deleting a post. `deleted` is false when no row was removed
 * (wrong session / missing). When a deleted post had media attached, the
 * Cloudinary identifiers are returned so the caller can destroy the asset.
 */
export interface DeletePostResult {
  deleted: boolean;
  mediaPublicId?: string;
  mediaType?: "image" | "video";
}

// --- Derived / composite DTOs ---------------------------------------------

export interface ScoreBreakdown {
  interest: number;
  popularity: number;
  event: number;
}

export interface ScoredBooth {
  booth: Booth;
  score: number;
  breakdown: ScoreBreakdown;
}

export interface BoothDetail {
  booth: Booth;
  category: Category;
  welcomeKit?: WelcomeKit;
  events: BoothEvent[];
  reviews: Review[];
  reviewSummary: { count: number };
}

export interface ExhibitionDetail {
  exhibition: Exhibition;
  halls: Hall[];
  categories: Category[];
}

// --- API envelope ----------------------------------------------------------

export type ApiErrorCode =
  | "VALIDATION"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "UNPROCESSABLE"
  | "INTERNAL";

export interface ApiError {
  code: ApiErrorCode;
  message: string;
  fields?: Record<string, string[]>;
}

export type ApiResult<T> = { data: T } | { error: ApiError };

export interface Paginated<T> {
  data: T[];
  nextCursor: string | null;
}
