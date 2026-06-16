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
  name: string;
  company: string;
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
  popularity: number; // 0..100
  createdAt: string;
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
}

export interface Waiting {
  boothId: string;
  enabled: boolean;
  queueCount: number;
  estimatedMinutes: number;
  updatedAt: string;
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
  rating: number; // 1..5
  comment: string;
  authorName: string;
  createdAt: string;
}

export interface UserPreference {
  sessionId: string;
  visitPurpose: VisitPurpose;
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

/** A nickname-based identity. Nickname is unique and used as the public key. */
export interface User {
  id: string;
  nickname: string;
  createdAt: string;
}

/** A signed-in visitor's personal record for a booth (visited / skip / memo). */
export interface BoothNote {
  userId: string;
  boothId: string;
  status?: "visited" | "skipped";
  memo?: string;
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
  createdAt: string;
}

// --- Derived / composite DTOs ---------------------------------------------

export interface ScoreBreakdown {
  interest: number;
  popularity: number;
  event: number;
  waitingPenalty: number;
}

export interface ScoredBooth {
  booth: Booth;
  score: number;
  breakdown: ScoreBreakdown;
}

export interface BoothDetail {
  booth: Booth;
  category: Category;
  waiting?: Waiting;
  welcomeKit?: WelcomeKit;
  events: BoothEvent[];
  reviews: Review[];
  reviewSummary: { avg: number; count: number };
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
