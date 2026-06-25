// ---------------------------------------------------------------------------
// OnboardingContext → 엔진이 먹는 UserPreferenceInput 로의 결정론적 변환.
//
// 항상 "유효하고 쓸 만한" preference를 만든다(약한 입력에도 합리적 기본값).
// Gemini 추론(onboarding-inference)이 성공하면 interests/priorityTags를 이쪽
// 결과 위에 덮어쓰는 방식으로 합쳐진다 — 이 파일 자체는 Gemini에 의존하지 않아
// 키가 없어도 온보딩이 끝까지 동작한다.
// ---------------------------------------------------------------------------

import type { UserPreferenceInput } from "@/lib/schemas";
import type { Category, MovementPreference, VisitPurpose } from "@/lib/types";
import type {
  AvailableTime,
  Intent,
  OnboardingContext,
  RouteStyle,
} from "@/lib/onboarding/onboarding-types";

// --- intent → 방문 목적 ----------------------------------------------------
const INTENT_PURPOSES: Record<Intent, VisitPurpose[]> = {
  discovery: ["information", "experience"],
  purchase: ["purchase"],
  information: ["information"],
  experience: ["experience"],
  casual: ["information"],
  unknown: ["experience", "information"],
};

// --- 가용 시간 → 분 --------------------------------------------------------
const TIME_MINUTES: Record<AvailableTime, number> = {
  "30m": 30,
  "1h": 60,
  "2_3h": 150,
  flexible: 240,
  unknown: 150,
};

// --- 취향/intent → 카테고리명 매칭 키워드 ----------------------------------
// 선호 키와 intent를 한국어 키워드로 펼친 뒤, 실제 카테고리 name/slug에 대해
// 부분일치로 매핑한다(전시마다 카테고리가 달라 휴리스틱). 못 맞추면 broad 폴백.
const PREF_KEYWORDS: Record<string, string[]> = {
  experience: ["체험", "키즈", "아동", "그림책", "놀이"],
  goods: ["굿즈", "문구", "리빙", "쇼핑", "잡화", "디자인"],
  tech: ["기술", "전자", "디지털", "ai", "콘텐츠", "웹툰"],
  design: ["디자인", "예술", "아트", "일러스트", "사진"],
  talk: ["인문", "교육", "학술", "사회", "강연"],
  event: ["문학", "작가", "공연"],
  quiet: [],
};

const INTENT_KEYWORDS: Record<Intent, string[]> = {
  discovery: ["독립", "예술", "일러스트", "그림책"],
  purchase: ["굿즈", "문구", "리빙", "쇼핑"],
  information: ["인문", "교육", "학술", "사회", "경제"],
  experience: ["체험", "아동", "키즈", "그림책"],
  casual: ["문학", "에세이"],
  unknown: [],
};

/** 키워드 묶음을 실제 카테고리 slug로 best-effort 매핑. */
function matchCategories(keywords: string[], categories: Category[]): string[] {
  const hit = new Set<string>();
  for (const kw of keywords) {
    const k = kw.toLowerCase();
    for (const c of categories) {
      const hay = `${c.name} ${c.slug}`.toLowerCase();
      if (hay.includes(k)) hit.add(c.slug);
    }
  }
  return [...hit];
}

// --- routeStyle → 이동 성향 ------------------------------------------------
function resolveMovement(ctx: OnboardingContext): MovementPreference {
  const minutes = TIME_MINUTES[ctx.availableTime ?? "unknown"];
  const byStyle: Record<RouteStyle, MovementPreference | "auto"> = {
    max_booths: "thorough",
    slow: "balanced",
    low_crowd: "balanced",
    popular: "balanced",
    hidden_mix: "thorough",
    ai_auto: "auto",
  };
  const picked = byStyle[ctx.routeStyle ?? "ai_auto"];
  if (picked !== "auto") return picked;
  // AI에게 맡김 → 시간·의도로 추론.
  if (minutes <= 60) return "shortest";
  if (ctx.intent === "discovery" || ctx.intent === "experience")
    return "thorough";
  return "balanced";
}

export interface BuiltProfile {
  preference: UserPreferenceInput;
  /** 선호 키 그대로(분석/표시용). */
  priorityTags: string[];
  routeName: string;
  reason: string;
  strategy: string;
}

/**
 * 컨텍스트만으로 완전한 preference + 동선 이름/이유를 만든다(Gemini 불필요).
 */
export function buildProfileFromContext(
  ctx: OnboardingContext,
  categories: Category[],
): BuiltProfile {
  const intent = ctx.intent ?? "unknown";

  const visitPurposes = INTENT_PURPOSES[intent];

  const availableMinutes = TIME_MINUTES[ctx.availableTime ?? "unknown"];

  const movementPreference = resolveMovement(ctx);

  // interests: 취향 + intent 키워드를 카테고리에 매핑, 없으면 broad 폴백.
  const keywords = [
    ...ctx.preferences.flatMap((p) => PREF_KEYWORDS[p] ?? []),
    ...INTENT_KEYWORDS[intent],
  ];
  let interests = matchCategories(keywords, categories);
  if (interests.length === 0) {
    interests = categories.slice(0, Math.min(3, categories.length)).map((c) => c.slug);
  }

  const preference: UserPreferenceInput = {
    visitPurposes,
    interests,
    availableMinutes,
    movementPreference,
    companionType: "alone",
  };

  return {
    preference,
    priorityTags: [...ctx.preferences],
    routeName: routeName(ctx),
    reason: routeReason(ctx),
    strategy: routeStrategy(ctx, movementPreference, availableMinutes),
  };
}

// --- 동선 이름/이유/전략 (결정론 폴백; Gemini가 있으면 덮어씀) -------------
function routeName(ctx: OnboardingContext): string {
  const style = ctx.routeStyle;
  const intent = ctx.intent;
  const short = ctx.availableTime === "30m" || ctx.availableTime === "1h";
  if (style === "low_crowd" || ctx.avoidances.includes("crowd"))
    return "사람이 적은 부스 우선 코스";
  if (style === "popular") return "인기 부스와 이벤트 중심 코스";
  if (style === "hidden_mix" || intent === "discovery")
    return short ? "숨은 부스 빠른 발견 코스" : "여유롭게 둘러보는 발견 코스";
  if (intent === "experience") return "직접 체험하는 부스 중심 코스";
  if (intent === "purchase") return "사고 비교하기 좋은 부스 코스";
  if (short || style === "max_booths") return "빠르게 핵심만 보는 코스";
  return "나에게 맞춘 추천 코스";
}

function routeReason(ctx: OnboardingContext): string {
  const bits: string[] = [];
  if (ctx.intent === "discovery") bits.push("새로운 발견");
  if (ctx.intent === "experience") bits.push("체험");
  if (ctx.intent === "purchase") bits.push("구매·비교");
  if (ctx.intent === "information") bits.push("정보·상담");
  if (ctx.avoidances.includes("crowd")) bits.push("혼잡 회피");
  const focus = bits.length ? bits.join(" · ") : "관심사";
  return `${focus}을(를) 중심으로, 동선과 시간을 고려해 골랐어.`;
}

function routeStrategy(
  ctx: OnboardingContext,
  movement: MovementPreference,
  minutes: number,
): string {
  const m =
    movement === "shortest"
      ? "핵심만 짧게"
      : movement === "thorough"
        ? "최대한 많이"
        : "균형 있게";
  return `${minutes}분, ${m} 둘러보는 동선`;
}
