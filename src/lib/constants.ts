import type {
  CompanionType,
  MovementPreference,
  VisitPurpose,
} from "@/lib/types";

type DimWeights = {
  interest: number;
  popularity: number;
  event: number;
  waiting: number;
};

export const SESSION_COOKIE = "roam_session";
export const USER_COOKIE = "roam_user";
export const ADMIN_COOKIE = "roam_admin";

/** A community post is hidden from the feed once this many distinct sessions
 * report it. Deduped per session, so it takes genuine independent reports. */
export const REPORT_HIDE_THRESHOLD = 3;

export interface OptionMeta<T extends string> {
  value: T;
  label: string;
  description: string;
  icon: string; // lucide icon name
}

export const VISIT_PURPOSE_OPTIONS: OptionMeta<VisitPurpose>[] = [
  {
    value: "purchase",
    label: "구매",
    description: "제품·서비스 구매가 목적이에요",
    icon: "ShoppingBag",
  },
  {
    value: "information",
    label: "정보 수집",
    description: "트렌드와 정보를 둘러봐요",
    icon: "Search",
  },
  {
    value: "networking",
    label: "네트워킹",
    description: "사람들과 교류하고 싶어요",
    icon: "Users",
  },
  {
    value: "experience",
    label: "체험",
    description: "직접 보고 경험하고 싶어요",
    icon: "Sparkles",
  },
];

export const MOVEMENT_OPTIONS: OptionMeta<MovementPreference>[] = [
  {
    value: "shortest",
    label: "최단 동선",
    description: "꼭 필요한 곳만 효율적으로",
    icon: "Zap",
  },
  {
    value: "balanced",
    label: "균형",
    description: "관심사와 동선을 적절히",
    icon: "Scale",
  },
  {
    value: "thorough",
    label: "꼼꼼하게",
    description: "최대한 많이 둘러볼래요",
    icon: "Compass",
  },
];

export const COMPANION_OPTIONS: OptionMeta<CompanionType>[] = [
  { value: "alone", label: "혼자", description: "혼자 자유롭게", icon: "User" },
  {
    value: "partner",
    label: "연인·친구",
    description: "둘이 함께",
    icon: "Heart",
  },
  {
    value: "family",
    label: "가족",
    description: "아이·부모님과",
    icon: "Home",
  },
  {
    value: "group",
    label: "단체",
    description: "여러 명이 함께",
    icon: "Users",
  },
  {
    value: "business",
    label: "비즈니스",
    description: "업무·미팅 목적",
    icon: "Briefcase",
  },
];

/** Available-time presets in minutes. */
export const TIME_OPTIONS = [
  { value: 60, label: "1시간" },
  { value: 120, label: "2시간" },
  { value: 180, label: "3시간" },
  { value: 240, label: "4시간 이상" },
] as const;

/** Per-purpose scoring weights (engine). Tuned, sum-agnostic. */
export const PURPOSE_WEIGHTS: Record<VisitPurpose, DimWeights> = {
  purchase: { interest: 1.4, popularity: 0.8, event: 0.6, waiting: 1.0 },
  information: { interest: 1.2, popularity: 1.0, event: 0.7, waiting: 0.6 },
  networking: { interest: 0.9, popularity: 0.9, event: 1.4, waiting: 0.5 },
  experience: { interest: 1.1, popularity: 1.1, event: 1.2, waiting: 0.8 },
};

/**
 * Per-companion multipliers, layered on top of PURPOSE_WEIGHTS. These tilt the
 * same four dimensions by who's visiting so the route genuinely differs:
 * - alone     : flexible, tolerates queues → softer waiting penalty.
 * - partner   : enjoy things together → events/experiences nudged up.
 * - family    : with kids/parents → popular & event-rich spots, but long
 *               queues hurt a lot more.
 * - group     : moving many people → strongest queue aversion, lean popular.
 * - business  : meetings/networking → events & relevance up, queue-tolerant.
 */
export const COMPANION_WEIGHTS: Record<CompanionType, DimWeights> = {
  alone: { interest: 1.0, popularity: 1.0, event: 1.0, waiting: 0.8 },
  partner: { interest: 1.0, popularity: 1.05, event: 1.2, waiting: 1.0 },
  family: { interest: 1.0, popularity: 1.1, event: 1.15, waiting: 1.4 },
  group: { interest: 0.95, popularity: 1.1, event: 1.1, waiting: 1.6 },
  business: { interest: 1.1, popularity: 0.9, event: 1.25, waiting: 0.7 },
};

/**
 * Movement preference tunables for route planning. `density` = how aggressively
 * to fill the available time: stop count scales with the time budget
 * (availableMinutes / dwell) × density, so a 3h visit plans far more stops than
 * a 1h one. shortest leaves slack (efficient), thorough packs the time full.
 */
export const MOVEMENT_TUNING: Record<
  MovementPreference,
  { walkPenalty: number; density: number; coverageBias: number }
> = {
  shortest: { walkPenalty: 1.6, density: 0.55, coverageBias: 0.6 },
  balanced: { walkPenalty: 1.0, density: 0.8, coverageBias: 1.0 },
  thorough: { walkPenalty: 0.5, density: 1.0, coverageBias: 1.4 },
};

/** Absolute safety ceiling on planned stops, regardless of time/density. */
export const MAX_PLANNED_STOPS = 50;

/**
 * Map-distance → walking minutes (official SIBF coordinate space, 3230×3650).
 * It's one connected hall, so walking between stands is near-instant — adjacent
 * stands (~58 units) ≈2s, a neighbouring stand (~120 units) ≈4s, and crossing
 * the whole venue (~4900 units) ≈2.5min. Dwell time, not travel, dominates a
 * plan — which is the realistic experience.
 */
export const WALK_UNITS_PER_MINUTE = 2000;
/** Average browsing time per booth (minutes), modulated by waiting. */
export const BASE_DWELL_MINUTES = 5;
