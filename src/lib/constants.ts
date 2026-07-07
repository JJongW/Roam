import type {
  CompanionType,
  MovementPreference,
  SignalKind,
  VisitPurpose,
} from "@/lib/types";

type DimWeights = {
  interest: number;
  popularity: number;
  event: number;
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
  purchase: { interest: 1.4, popularity: 0.8, event: 0.6 },
  information: { interest: 1.2, popularity: 1.0, event: 0.7 },
  networking: { interest: 0.9, popularity: 0.9, event: 1.4 },
  experience: { interest: 1.1, popularity: 1.1, event: 1.2 },
};

/**
 * Merge several purposes into one weight set by averaging each dimension, so a
 * multi-goal visitor (e.g. 구매 + 체험) gets a blend rather than only the first
 * pick. Falls back to "experience" when the list is somehow empty.
 */
export function mergePurposeWeights(purposes: VisitPurpose[]): DimWeights {
  const list = purposes.length ? purposes : (["experience"] as VisitPurpose[]);
  const sum = list.reduce<DimWeights>(
    (acc, p) => {
      const w = PURPOSE_WEIGHTS[p];
      return {
        interest: acc.interest + w.interest,
        popularity: acc.popularity + w.popularity,
        event: acc.event + w.event,
      };
    },
    { interest: 0, popularity: 0, event: 0 },
  );
  const n = list.length;
  return {
    interest: sum.interest / n,
    popularity: sum.popularity / n,
    event: sum.event / n,
  };
}

/**
 * L4 메모리 — 신호 종류별 가중치. 관심 confidence 수학(순수·결정론)의 입력.
 * booth_visited=암묵 강 / bookmark·route=명시 / skip=음의 신호.
 */
export const SIGNAL_WEIGHTS: Record<
  SignalKind,
  { explicit: number; implicit: number; negative: number }
> = {
  booth_visited: { explicit: 0, implicit: 1.0, negative: 0 },
  booth_bookmarked: { explicit: 1.2, implicit: 0, negative: 0 },
  route_saved: { explicit: 1.5, implicit: 0, negative: 0 },
  booth_skipped: { explicit: 0, implicit: 0, negative: 0.8 },
};

/** L4 증류 튜닝. confidence = raw/(raw+K), 시간감쇠 반감기 halfLifeDays. */
export const MEMORY_TUNING = {
  halfLifeDays: 90,
  K: 3, // 포화 상수
  thetaHi: 0.6, // 승격(안정 관심) 임계
  thetaLo: 0.15, // 가지치기 임계
  topN: 30, // interests 상위 유지 수
} as const;

/**
 * Per-companion multipliers, layered on top of PURPOSE_WEIGHTS. These tilt the
 * same dimensions by who's visiting so the route genuinely differs:
 * - alone     : flexible, self-paced.
 * - partner   : enjoy things together → events/experiences nudged up.
 * - family    : with kids/parents → popular & event-rich spots.
 * - group     : moving many people → lean popular.
 * - business  : meetings/networking → events & relevance up.
 */
export const COMPANION_WEIGHTS: Record<CompanionType, DimWeights> = {
  alone: { interest: 1.0, popularity: 1.0, event: 1.0 },
  partner: { interest: 1.0, popularity: 1.05, event: 1.2 },
  family: { interest: 1.0, popularity: 1.1, event: 1.15 },
  group: { interest: 0.95, popularity: 1.1, event: 1.1 },
  business: { interest: 1.1, popularity: 0.9, event: 1.25 },
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
/** Fallback browsing time per booth (minutes) when size is unknown. */
export const BASE_DWELL_MINUTES = 5;

// --- Per-booth dwell by stand size -----------------------------------------
// 실제 체류는 부스 크기에 따라 크게 다르다 — 제일 작은 53×53 스탠드는 2분도 안
// 머물고, 가장 큰 부스라야 10분 안팎. floorplan 면적(w×h)으로 5단계로 나눠
// 작은 부스를 과대평가하지 않게 한다(과대평가하면 시간예산이 금방 차서 추천
// 부스 수가 적어진다). 경계는 SIBF floorplan 실측 면적 분포 기준.
// 2809(53×53)→2, 5830(53×110)→4, ~12k→6, ~24~45k→8, 50k+→10.
/** 면적 오름차순 경계 — 첫 매칭 tier의 minutes 사용. 마지막은 Infinity(최대 부스). */
export const DWELL_TIERS: { maxArea: number; minutes: number }[] = [
  { maxArea: 5000, minutes: 2 },
  { maxArea: 8000, minutes: 4 },
  { maxArea: 20000, minutes: 6 },
  { maxArea: 50000, minutes: 8 },
  { maxArea: Infinity, minutes: 10 },
];
/** 정지 수 상한 추정에 쓰는 최소 체류(분) — 가장 빽빽한(모두 소형) 경우 기준. */
export const MIN_DWELL_MINUTES = 2;
