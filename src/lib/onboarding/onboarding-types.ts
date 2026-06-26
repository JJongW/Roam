// ---------------------------------------------------------------------------
// AI Companion 온보딩 — 타입. 정적 폼이 아니라 "동반자와의 첫 대화"를 모델링한다.
// 상태(OnboardingContext)는 답변마다 조금씩 채워지고, 추론(inferredProfile)은
// 막판에 Gemini가 채운다. 동선 빌드는 기존 결정론 엔진이 맡는다.
// ---------------------------------------------------------------------------

/**
 * 부스 단위 계획. 사용자는 이미 특정 전시 안에 들어와 있으므로 "전시 선택"이
 * 아니라 "가고 싶은 부스를 이미 정했는지"를 묻는다. 이 값이 온보딩 분기를 가른다.
 *   has_booths → 부스 picker → 관련 부스 여부 → 취향 …
 *   open       → 의도(intent) 기반 추천 흐름.
 */
export type BoothPlan =
  | "has_booths" // 이미 가보고 싶은 부스가 있어
  | "open"; // 추천받고 싶어

/** 언제 방문하는지. 오늘이면 진행 이벤트/대기까지 고려한다. */
export type VisitDateType =
  | "today"
  | "this_week"
  | "specific_date"
  | "undecided";

/** 관람의 속마음 — 동적 follow-up과 동선 전략을 가르는 핵심 신호. */
export type Intent =
  | "discovery" // 새로운 걸 발견하고 싶어
  | "purchase" // 좋은 제품을 사고 싶어
  | "information" // 정보를 얻고 싶어
  | "experience" // 직접 체험해보고 싶어
  | "casual" // 가볍게 둘러보고 싶어
  | "unknown"; // 아직 잘 모르겠어

/** 얼마나 둘러볼 여유가 있는지. */
export type AvailableTime = "30m" | "1h" | "2_3h" | "flexible" | "unknown";

/** 안내 방식. ai_auto는 "정식·추천" 선택지로 다룬다. */
export type RouteStyle =
  | "max_booths" // 최대한 많이 보기
  | "slow" // 천천히 둘러보기
  | "low_crowd" // 사람이 적은 곳 위주
  | "popular" // 인기 부스 위주
  | "hidden_mix" // 숨은 부스 섞어보기
  | "ai_auto"; // AI에게 맡길게

/** 막판에 Gemini가 채우는 추론 결과. 동선 이름/이유의 근거가 된다. */
export interface InferredProfile {
  /** 한 문장 요약 ("새로운 발견을 좋아하는, 여유로운 탐험가"). */
  summary: string;
  /** 추천 우선순위 태그 — 실제 카테고리 slug로 매핑된다. */
  priorityTags: string[];
  /** 동선 전략 설명 (엔진 파라미터의 자연어 근거). */
  routeStrategy: string;
  /** 왜 이 동선을 추천하는지, 사용자에게 보여줄 한두 문장. */
  recommendationReason: string;
}

/**
 * 온보딩 누적 상태. 답변마다 부분 갱신(Partial)된다.
 * dynamicAnswers는 intent별 follow-up 답을 stepId 키로 보관 — 스키마를 늘리지
 * 않고 분기 답을 유연하게 담기 위함.
 */
export interface OnboardingContext {
  boothPlan?: BoothPlan;
  /** has_booths 분기에서 직접 고른 부스 id들. 동선에 항상 포함된다. */
  selectedBoothIds: string[];
  /** 고른 부스 외에 관련/유사 부스도 추천에 더할지. */
  wantRelatedBooths?: boolean;
  visitDateType?: VisitDateType;
  visitDate?: string; // specific_date 선택 시 ISO 날짜
  /** 관람 의도 — 복수 선택. intent는 그중 대표(첫 번째)로 follow-up 분기·이름에 쓴다. */
  intents: Intent[];
  intent?: Intent;
  dynamicAnswers: Record<string, string | string[]>;
  preferences: string[]; // 취향 다중 선택 값
  availableTime?: AvailableTime;
  routeStyle?: RouteStyle;
  avoidances: string[]; // 피하고 싶은 것 (대기/혼잡 등)
  inferredProfile?: InferredProfile;
}

export const emptyOnboardingContext = (): OnboardingContext => ({
  selectedBoothIds: [],
  intents: [],
  dynamicAnswers: {},
  preferences: [],
  avoidances: [],
});

/** 한 선택지. 단일/다중 공용. */
export interface OnboardingOption {
  value: string;
  label: string;
  /** 보조 설명(선택). 칩이 아닌 카드형일 때만 노출. */
  hint?: string;
}

/** "내가 이해한 내용" 패널의 한 줄. */
export interface UnderstandingItem {
  /** 라벨 ("방문 시점"). */
  key: string;
  /** 값 ("이번 주"). 아직 모르면 생략. */
  value: string;
}

/** 한 스텝의 정의. options는 정적이거나 context에 따라 동적으로 생성된다. */
export interface OnboardingStepDef {
  id: string;
  /** AI 동반자가 던지는 인사/반응 + 질문. context로 문구가 바뀔 수 있다. */
  message: (ctx: OnboardingContext) => string;
  question: (ctx: OnboardingContext) => string;
  /** 질문 아래 보조 안내(선택). 예: "여러 개 골라도 돼". */
  hint?: string;
  /** 선택지. 동적 follow-up은 intent로 분기. */
  options: (ctx: OnboardingContext) => OnboardingOption[];
  /** 다중 선택 스텝인지. */
  multi?: boolean;
  /** 답을 context에 반영. */
  apply: (
    ctx: OnboardingContext,
    value: string | string[],
  ) => OnboardingContext;
  /** 다음 스텝 id. null이면 마지막(요약/생성)으로. */
  next: (ctx: OnboardingContext) => string | null;
}

/**
 * 턴 결과 — 서버(Gemini)가 반응 문구·이해 요약을 다듬어 돌려줄 수도 있고,
 * 클라이언트가 결정론 템플릿으로 즉시 만들 수도 있는 단일 형태.
 */
export interface OnboardingStepResult {
  aiMessage: string;
  question: string;
  options: OnboardingOption[];
  multi: boolean;
  updatedContext: OnboardingContext;
  understanding: UnderstandingItem[];
  nextStepId: string | null;
}

/** 최종 생성된 동선(요약/프리뷰용). 실제 RoutePlan은 엔진이 만든다. */
export interface GeneratedRouteSummary {
  name: string;
  reason: string;
  estimatedDurationMinutes: number;
  boothCount: number;
  strategy: string;
}
