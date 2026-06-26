// ---------------------------------------------------------------------------
// AI Companion 온보딩 — 스텝 그래프 + 문구.
//
// 핵심 원칙: 폼이 아니라 대화. 한 번에 하나만 묻고, 답에 반응하고, 다음 질문을
// 직전 답에 따라 바꾼다. 옵션/분기는 여기서 결정론적으로 정의하고, 개인화된
// 반응 문구·추론은 Gemini가 위에서 덧입힌다(없으면 여기 템플릿이 그대로 쓰임).
//
// 사용자는 이미 특정 전시(slug) 안에 들어와 있다 → "전시 선택"은 묻지 않고,
// 대신 "이미 가고 싶은 부스가 있는지"로 흐름을 가른다.
//   has_booths → booth_pick → booth_related → preference → visit_date → …
//   open       → visit_date → intent(복수) → followup(의도마다) → preference → …
// ---------------------------------------------------------------------------

import type {
  Intent,
  OnboardingContext,
  OnboardingOption,
  OnboardingStepDef,
  UnderstandingItem,
} from "@/lib/onboarding/onboarding-types";

// --- 스텝 목록 (진행 표시 순서용; 실제 분기는 각 step.next가 결정) ----------
export const STEP_IDS = [
  "start", // Step 1. 부스를 이미 정했는지
  "booth_pick", // (has_booths) 부스 직접 선택
  "booth_related", // (has_booths) 관련 부스도 더할지
  "visit_date", // 방문 시점
  "intent", // (open) 관람 의도 — 복수
  "followup", // (open) 의도별 동적 추가질문 (선택한 의도마다 반복)
  "preference", // 평소 취향 (다중)
  "time", // 가용 시간
  "route_style", // 안내 방식
] as const;
export type StepId = (typeof STEP_IDS)[number];

// --- Step 1. 부스 계획 -----------------------------------------------------
const startStep: OnboardingStepDef = {
  id: "start",
  message: () =>
    "안녕? 나는 안내 도우미 Roam이야.\n전시를 더 편하게 둘러볼 수 있도록 같이 도와줄게.",
  question: () => "혹시 이미 가보고 싶은 부스가 있어?",
  options: () => [
    {
      value: "has_booths",
      label: "응, 정해둔 곳이 있어",
      hint: "바로 골라줄게",
    },
    { value: "open", label: "아니, 추천받고 싶어", hint: "대화로 맞춰보자" },
  ],
  apply: (ctx, v) => ({ ...ctx, boothPlan: v as never }),
  next: (ctx) => (ctx.boothPlan === "has_booths" ? "booth_pick" : "visit_date"),
};

// --- Step 2a. 부스 직접 선택 (has_booths) ----------------------------------
// 선택지 목록은 정적이지 않고 실제 부스 데이터 → 컴포넌트가 커스텀 렌더(검색+다중).
// apply는 컴포넌트가 commit(선택 id 배열)로 호출한다.
const boothPickStep: OnboardingStepDef = {
  id: "booth_pick",
  message: () => "좋아. 어디부터 가고 싶은지 골라줘.",
  question: () => "가고 싶은 부스를 골라줘",
  options: () => [],
  multi: true,
  apply: (ctx, v) => ({
    ...ctx,
    selectedBoothIds: Array.isArray(v) ? v : [v],
  }),
  next: () => "booth_related",
};

// --- Step 2b. 관련 부스 여부 (has_booths) ----------------------------------
const boothRelatedStep: OnboardingStepDef = {
  id: "booth_related",
  message: (ctx) =>
    `좋아. ${ctx.selectedBoothIds.length}곳 담았어.\n네가 고른 곳을 중심으로 동선을 짜줄게.`,
  question: () => "고른 곳 말고, 관련된 다른 부스도 같이 찾아줄까?",
  options: () => [
    {
      value: "want",
      label: "응, 비슷한 곳도 보여줘",
      hint: "관심 갈 만한 곳을 더해줄게",
    },
    { value: "only", label: "아니, 이 부스들만 갈래" },
  ],
  apply: (ctx, v) => ({ ...ctx, wantRelatedBooths: v === "want" }),
  next: () => "preference",
};

// --- Step 3. 방문 시점 -----------------------------------------------------
const visitDateStep: OnboardingStepDef = {
  id: "visit_date",
  message: () => "좋아. 그럼 일정부터 맞춰볼게.",
  question: () => "언제 방문할 예정이야?",
  options: () => [
    { value: "today", label: "오늘" },
    { value: "this_week", label: "이번 주" },
    { value: "specific_date", label: "날짜 선택" },
    { value: "undecided", label: "아직 정하지 않았어" },
  ],
  apply: (ctx, v) => ({ ...ctx, visitDateType: v as never }),
  // has_booths 분기는 의도/follow-up를 건너뛰고 시간으로. open 분기는 의도로.
  next: (ctx) => (ctx.boothPlan === "has_booths" ? "time" : "intent"),
};

/** Step 방문 시점 답에 대한 AI 반응 — 다음 스텝(intent) 메시지 앞에 붙는다. */
export function visitDateReaction(ctx: OnboardingContext): string {
  switch (ctx.visitDateType) {
    case "today":
      return "좋아. 그럼 지금 진행 중인 이벤트나 대기 상황도 같이 고려해볼게.";
    case "this_week":
    case "specific_date":
      return "좋아. 그 날짜 기준으로 운영 정보와 이벤트를 함께 반영해볼게.";
    default:
      return "괜찮아. 시간은 천천히 정해도 돼. 먼저 취향부터 맞춰보자.";
  }
}

// --- Step 4. 관람 의도 (복수 선택) -----------------------------------------
const intentStep: OnboardingStepDef = {
  id: "intent",
  message: (ctx) => visitDateReaction(ctx),
  question: () => "이번 전시가 끝났을 때 어떤 기분이면 만족스러울 것 같아?",
  hint: "여러 개 골라도 돼",
  multi: true,
  options: () => [
    { value: "discovery", label: "새로운 걸 발견하고 싶어" },
    { value: "purchase", label: "좋은 제품을 사고 싶어" },
    {
      value: "information",
      label: "일이나 공부에 도움이 되는 정보를 얻고 싶어",
    },
    { value: "experience", label: "직접 체험해보고 싶어" },
    { value: "casual", label: "그냥 가볍게 둘러보고 싶어" },
    { value: "unknown", label: "아직 잘 모르겠어" },
  ],
  apply: (ctx, v) => {
    let list = (Array.isArray(v) ? v : [v]) as Intent[];
    // 다른 의도를 골랐다면 "잘 모르겠어"는 의미 없으니 뺀다.
    if (list.length > 1) list = list.filter((i) => i !== "unknown");
    const intents = list.length ? list : (["unknown"] as Intent[]);
    return { ...ctx, intents, intent: intents[0] };
  },
  next: () => "followup",
};

// --- Step 5. 동적 follow-up (선택한 의도마다 한 번씩 반복) ------------------
interface FollowupSpec {
  message: string;
  question: string;
  options: OnboardingOption[];
}

const FOLLOWUPS: Record<Intent, FollowupSpec> = {
  discovery: {
    message: "좋아. 그럼 유명한 부스만 보기보다 숨은 부스도 같이 찾아볼게.",
    question: "새로운 걸 좋아한다면, 직접 체험하는 부스도 괜찮아?",
    options: [
      { value: "ok_experience", label: "좋아" },
      { value: "prefer_view", label: "체험보다는 구경이 좋아" },
      { value: "avoid_crowd", label: "사람 많은 곳은 피하고 싶어" },
    ],
  },
  purchase: {
    message:
      "좋아. 그러면 실제로 구매하거나 비교해볼 수 있는 부스를 우선해서 볼게.",
    question: "가격 혜택이나 현장 이벤트도 중요해?",
    options: [
      { value: "deal_important", label: "중요해" },
      { value: "quality_first", label: "제품 퀄리티가 더 중요해" },
      { value: "both", label: "둘 다 보고 싶어" },
    ],
  },
  information: {
    message:
      "좋아. 그러면 설명이 잘 되어 있거나 상담받기 좋은 부스를 우선해서 볼게.",
    question:
      "깊게 상담받는 쪽이 좋아, 아니면 빠르게 여러 곳을 보는 쪽이 좋아?",
    options: [
      { value: "deep", label: "깊게 상담받고 싶어" },
      { value: "wide", label: "빠르게 여러 곳을 보고 싶어" },
      { value: "mix", label: "AI가 적당히 섞어줘" },
    ],
  },
  experience: {
    message: "좋아. 그럼 직접 해볼 수 있는 부스를 조금 더 많이 넣어둘게.",
    question: "대기 시간이 있어도 괜찮아?",
    options: [
      { value: "ok_wait", label: "괜찮아" },
      { value: "short_wait", label: "짧은 대기 위주로 보고 싶어" },
      { value: "low_crowd", label: "사람이 적은 곳이 좋아" },
    ],
  },
  casual: {
    message:
      "좋아. 그럼 너무 빡빡한 코스보다는 가볍게 둘러볼 수 있는 길로 잡아볼게.",
    question: "사진 찍기 좋은 곳이나 이벤트 부스도 포함할까?",
    options: [
      { value: "ok_photo", label: "좋아" },
      { value: "quiet", label: "조용한 곳이 좋아" },
      { value: "popular", label: "인기 부스 위주로 보고 싶어" },
    ],
  },
  unknown: {
    message: "괜찮아. 그럼 몇 가지 느낌 중에서 조금 더 끌리는 걸 골라봐.",
    question: "어떤 쪽이 더 끌려?",
    options: [
      { value: "popular", label: "사람들이 많이 찾는 부스" },
      { value: "hidden", label: "숨겨진 부스" },
      { value: "photo", label: "사진 찍기 좋은 곳" },
      { value: "experience", label: "체험이 많은 곳" },
      { value: "fast", label: "빠르게 둘러볼 수 있는 곳" },
    ],
  },
};

export function followupSpec(intent: Intent | undefined): FollowupSpec {
  return FOLLOWUPS[intent ?? "unknown"];
}

/** 선택한 의도 목록(비어 있으면 unknown 하나). follow-up를 이 순서대로 묻는다. */
export function followupIntents(ctx: OnboardingContext): Intent[] {
  return ctx.intents.length ? ctx.intents : ["unknown"];
}

/** 지금까지 답한 follow-up 개수 = dynamicAnswers의 followup_* 키 수. */
export function followupAnsweredCount(ctx: OnboardingContext): number {
  return Object.keys(ctx.dynamicAnswers).filter((k) =>
    k.startsWith("followup_"),
  ).length;
}

/** 지금 물어야 할 follow-up 의도 = 선택 의도 중 아직 안 물어본 것. */
export function currentFollowupIntent(ctx: OnboardingContext): Intent {
  const list = followupIntents(ctx);
  return list[Math.min(followupAnsweredCount(ctx), list.length - 1)];
}

const followupStep: OnboardingStepDef = {
  id: "followup",
  message: (ctx) => {
    const list = followupIntents(ctx);
    const idx = followupAnsweredCount(ctx);
    const base = followupSpec(currentFollowupIntent(ctx)).message;
    // 의도를 여러 개 골랐으면 지금 몇 번째를 묻는지 살짝 알려준다.
    return list.length > 1 ? `(${idx + 1}/${list.length}) ${base}` : base;
  },
  question: (ctx) => followupSpec(currentFollowupIntent(ctx)).question,
  options: (ctx) => followupSpec(currentFollowupIntent(ctx)).options,
  apply: (ctx, v) => {
    const value = v as string;
    const intent = currentFollowupIntent(ctx);
    const avoidances = [...ctx.avoidances];
    if (value === "avoid_crowd" || value === "low_crowd" || value === "quiet") {
      if (!avoidances.includes("crowd")) avoidances.push("crowd");
    }
    if (value === "short_wait") {
      if (!avoidances.includes("long_wait")) avoidances.push("long_wait");
    }
    return {
      ...ctx,
      dynamicAnswers: { ...ctx.dynamicAnswers, [`followup_${intent}`]: value },
      avoidances,
    };
  },
  // 아직 안 물어본 의도가 남았으면 follow-up 반복, 다 물었으면 취향으로.
  next: (ctx) =>
    followupAnsweredCount(ctx) < followupIntents(ctx).length
      ? "followup"
      : "preference",
};

// --- Step 6. 평소 취향 (다중 선택) -----------------------------------------
const preferenceStep: OnboardingStepDef = {
  id: "preference",
  message: () => "좋아. 이제 네 취향을 조금 더 알고 싶어.",
  question: () => "평소에는 어떤 부스에서 오래 머무는 편이야?",
  multi: true,
  options: () => [
    { value: "experience", label: "직접 체험할 수 있는 곳" },
    { value: "goods", label: "굿즈나 쇼핑" },
    { value: "tech", label: "새로운 기술" },
    { value: "design", label: "디자인이 좋은 공간" },
    { value: "talk", label: "설명을 들을 수 있는 곳" },
    { value: "event", label: "이벤트가 있는 곳" },
    { value: "quiet", label: "사람이 적은 곳" },
    { value: "unknown", label: "잘 모르겠어" },
  ],
  apply: (ctx, v) => {
    const list = (Array.isArray(v) ? v : [v]).filter((x) => x !== "unknown");
    const avoidances = [...ctx.avoidances];
    if ((Array.isArray(v) ? v : [v]).includes("quiet")) {
      if (!avoidances.includes("crowd")) avoidances.push("crowd");
    }
    return { ...ctx, preferences: list, avoidances };
  },
  // has_booths 분기는 아직 일정을 안 물었으니 visit_date로, open은 시간으로.
  next: (ctx) => (ctx.boothPlan === "has_booths" ? "visit_date" : "time"),
};

/** 취향 선택 후 반응. */
export const preferenceReaction =
  "좋아. 선택한 취향을 기준으로 추천 우선순위를 조정해둘게.";

// --- Step 7. 가용 시간 -----------------------------------------------------
const timeStep: OnboardingStepDef = {
  id: "time",
  message: () => preferenceReaction,
  question: () => "얼마나 여유롭게 둘러볼 수 있어?",
  options: () => [
    { value: "30m", label: "30분 정도" },
    { value: "1h", label: "1시간 정도" },
    { value: "2_3h", label: "2~3시간" },
    { value: "flexible", label: "시간은 크게 상관없어" },
    { value: "unknown", label: "아직 모르겠어" },
  ],
  apply: (ctx, v) => ({ ...ctx, availableTime: v as never }),
  next: () => "route_style",
};

// --- Step 8. 안내 방식 -----------------------------------------------------
const routeStyleStep: OnboardingStepDef = {
  id: "route_style",
  message: () => "거의 다 왔어. 나는 여러 방식으로 안내할 수 있어.",
  question: () => "어떤 스타일이 좋을까?",
  options: () => [
    {
      value: "ai_auto",
      label: "AI에게 맡길게",
      hint: "네 답을 바탕으로 가장 잘 맞게",
    },
    { value: "max_booths", label: "최대한 많이 보기" },
    { value: "slow", label: "천천히 둘러보기" },
    { value: "low_crowd", label: "사람이 적은 곳 위주" },
    { value: "popular", label: "인기 부스 위주" },
    { value: "hidden_mix", label: "숨은 부스 섞어보기" },
  ],
  apply: (ctx, v) => ({ ...ctx, routeStyle: v as never }),
  next: () => null, // → 요약 + 동선 생성
};

// --- 그래프 ----------------------------------------------------------------
export const STEPS: Record<StepId, OnboardingStepDef> = {
  start: startStep,
  booth_pick: boothPickStep,
  booth_related: boothRelatedStep,
  visit_date: visitDateStep,
  intent: intentStep,
  followup: followupStep,
  preference: preferenceStep,
  time: timeStep,
  route_style: routeStyleStep,
};

export const FIRST_STEP_ID: StepId = "start";

// --- "내가 이해한 내용" 요약 라벨 ------------------------------------------
const PLAN_LABEL: Record<string, string> = {
  has_booths: "갈 부스 정함",
  open: "추천 받기",
};
const DATE_LABEL: Record<string, string> = {
  today: "오늘",
  this_week: "이번 주",
  specific_date: "선택한 날짜",
  undecided: "미정",
};
const INTENT_LABEL: Record<Intent, string> = {
  discovery: "새로운 발견",
  purchase: "구매",
  information: "정보·공부",
  experience: "체험",
  casual: "가벼운 관람",
  unknown: "탐색 중",
};
const TIME_LABEL: Record<string, string> = {
  "30m": "30분",
  "1h": "1시간",
  "2_3h": "2~3시간",
  flexible: "여유롭게",
  unknown: "미정",
};
const STYLE_LABEL: Record<string, string> = {
  ai_auto: "AI 추천",
  max_booths: "최대한 많이",
  slow: "천천히",
  low_crowd: "사람 적은 곳",
  popular: "인기 부스",
  hidden_mix: "숨은 부스 섞기",
};
const PREF_LABEL: Record<string, string> = {
  experience: "체험",
  goods: "굿즈·쇼핑",
  tech: "새 기술",
  design: "좋은 디자인",
  talk: "설명·상담",
  event: "이벤트",
  quiet: "사람 적은 곳",
};

/**
 * 현재 context로 "내가 이해한 내용" 패널 줄을 만든다. 아직 답하지 않은 항목은
 * 빼서, 폼이 아니라 AI가 점점 이해해가는 느낌을 준다.
 */
export function buildUnderstanding(
  ctx: OnboardingContext,
): UnderstandingItem[] {
  const items: UnderstandingItem[] = [];
  if (ctx.boothPlan)
    items.push({ key: "방문 상태", value: PLAN_LABEL[ctx.boothPlan] });
  if (ctx.selectedBoothIds.length)
    items.push({ key: "고른 부스", value: `${ctx.selectedBoothIds.length}곳` });
  if (ctx.wantRelatedBooths != null)
    items.push({
      key: "관련 부스",
      value: ctx.wantRelatedBooths ? "더 보기" : "고른 곳만",
    });
  if (ctx.visitDateType)
    items.push({ key: "방문 시점", value: DATE_LABEL[ctx.visitDateType] });
  if (ctx.intents.length)
    items.push({
      key: "목적",
      value: ctx.intents.map((i) => INTENT_LABEL[i]).join(" · "),
    });
  if (ctx.preferences.length)
    items.push({
      key: "선호",
      value: ctx.preferences.map((p) => PREF_LABEL[p] ?? p).join(" · "),
    });
  if (ctx.avoidances.includes("crowd"))
    items.push({ key: "피하고 싶은 것", value: "혼잡·대기" });
  if (ctx.availableTime)
    items.push({ key: "시간", value: TIME_LABEL[ctx.availableTime] });
  if (ctx.routeStyle)
    items.push({ key: "안내 방식", value: STYLE_LABEL[ctx.routeStyle] });
  return items;
}
