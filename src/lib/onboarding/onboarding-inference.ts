import "server-only";
// ---------------------------------------------------------------------------
// AI Companion 온보딩 — Gemini 추론 레이어.
//
// 두 가지 일을 한다:
//   1) generateTurnReaction — 답변 하나에 대한 짧은 개인화 반응 한 줄.
//   2) inferOnboardingProfile — 누적 컨텍스트 전체를 읽어 추론 프로필을 생성
//      (요약·우선순위 태그=실제 카테고리 slug·전략·추천 이유·동선 이름).
//
// Gemini는 "검증된 텍스트/선호"만 만든다. 동선 빌드는 결정론 엔진이 맡는다.
// 키가 없거나 호출이 실패하면 호출부가 route-profile-builder의 결정론 결과로
// 폴백하므로, 이 파일이 죽어도 온보딩은 끝까지 동작한다.
// ---------------------------------------------------------------------------

import { z } from "zod";
import { generateJSON, generateText } from "@/lib/ai/gemini";
import type { Category } from "@/lib/types";
import type {
  InferredProfile,
  OnboardingContext,
} from "@/lib/onboarding/onboarding-types";

const SYSTEM = [
  "너는 도서전·전시 관람을 함께 도와주는 AI 동반자야.",
  "차분하고, 신뢰감 있고, 친구처럼 반말로 짧게 말해.",
  "이모지·과한 수식어·로봇 말투 금지. 사용자가 '나를 이해받고 있다'고 느끼게 해.",
].join(" ");

/** 컨텍스트를 프롬프트에 넣을 사람이 읽을 수 있는 한국어 줄로 직렬화. */
export function describeContext(ctx: OnboardingContext): string {
  const lines: string[] = [];
  if (ctx.planningStage) lines.push(`계획 단계: ${ctx.planningStage}`);
  if (ctx.visitDateType) lines.push(`방문 시점: ${ctx.visitDateType}`);
  if (ctx.intent) lines.push(`관람 의도: ${ctx.intent}`);
  if (Object.keys(ctx.dynamicAnswers).length)
    lines.push(`추가 답변: ${JSON.stringify(ctx.dynamicAnswers)}`);
  if (ctx.preferences.length)
    lines.push(`평소 취향: ${ctx.preferences.join(", ")}`);
  if (ctx.avoidances.length)
    lines.push(`피하고 싶은 것: ${ctx.avoidances.join(", ")}`);
  if (ctx.availableTime) lines.push(`가용 시간: ${ctx.availableTime}`);
  if (ctx.routeStyle) lines.push(`안내 방식: ${ctx.routeStyle}`);
  return lines.join("\n");
}

// --- 1) 턴 반응 ------------------------------------------------------------
/**
 * 방금 한 답에 대한 짧은 반응 한 줄(1~2문장). 다음 질문을 더 자연스럽게 잇기
 * 위한 "들었어" 신호. 실패하면 호출부가 flow 템플릿 문구를 그대로 쓰면 된다.
 */
export async function generateTurnReaction(opts: {
  ctx: OnboardingContext;
  stepId: string;
  answerLabel: string;
  nextQuestion: string;
}): Promise<string> {
  const prompt = [
    "지금까지 파악한 사용자 정보:",
    describeContext(opts.ctx) || "(아직 거의 없음)",
    "",
    `방금 '${opts.stepId}' 질문에 이렇게 답했어: "${opts.answerLabel}"`,
    `다음에 물어볼 질문: "${opts.nextQuestion}"`,
    "",
    "방금 답에 가볍게 반응하는 1~2문장을 한국어 반말로 써. 다음 질문 자체는",
    "다시 적지 말고, 답을 이해했다는 느낌만 줘. 따옴표 없이 본문만 출력.",
  ].join("\n");
  const text = await generateText({ prompt, system: SYSTEM, temperature: 0.6 });
  return text.trim().replace(/^["']|["']$/g, "");
}

// --- 2) 최종 추론 ----------------------------------------------------------
const inferenceSchema = z.object({
  /** 반드시 주어진 slug 목록 중에서만. 추천 우선순위가 높은 순. */
  interests: z.array(z.string()).default([]),
  /** 우선순위 태그(자유어, 표시용). */
  priorityTags: z.array(z.string()).default([]),
  /** 피하고 싶은 것(혼잡/대기 등). */
  avoidances: z.array(z.string()).default([]),
  /** 사용자를 한 문장으로 요약. */
  summary: z.string().default(""),
  /** 동선 전략 설명. */
  routeStrategy: z.string().default(""),
  /** 왜 이렇게 추천하는지 1~2문장. */
  recommendationReason: z.string().default(""),
  /** 동선 이름(짧고 구체적, "...코스"). */
  routeName: z.string().default(""),
});

export type OnboardingInference = z.infer<typeof inferenceSchema> & {
  /** Gemini가 매핑한 interests를 실제 slug로 정제한 결과. */
  interestsResolved: string[];
};

/**
 * 누적 컨텍스트 → 추론 프로필. interests는 실제 카테고리 slug로 강제 정제한다
 * (모델이 환각한 slug는 버림). 호출 실패/빈 결과는 호출부가 결정론 폴백.
 */
export async function inferOnboardingProfile(
  ctx: OnboardingContext,
  categories: Category[],
  /** 부스 enrichment에서 모은 굿즈·테마 어휘(수동 주입분). 있으면 프롬프트에
   *  주입해 "현장에 실제로 뭐가 있는지"를 반영한 추론을 돕는다. */
  boothVocab: string[] = [],
): Promise<OnboardingInference> {
  const vocab = categories.map((c) => `${c.slug} (${c.name})`).join(", ");
  const goods = boothVocab.slice(0, 60).join(", ");
  const prompt = [
    "아래는 전시 방문객과의 짧은 온보딩 대화에서 파악한 정보야.",
    "이걸 바탕으로 추천 동선의 추론 프로필을 JSON 하나로만 출력해. 설명/마크다운 금지.",
    "",
    "사용자 정보:",
    describeContext(ctx),
    "",
    `사용 가능한 카테고리 slug(반드시 이 중에서만 interests에 넣어): ${vocab}`,
    ...(goods
      ? ["", `현장 부스에서 실제로 보이는 굿즈·테마 키워드(참고): ${goods}`]
      : []),
    "",
    "규칙:",
    "- interests: 취향·의도에 가장 맞는 카테고리 slug 배열(우선순위 높은 순, 최대 6개).",
    "  맞는 게 없으면 빈 배열.",
    "- priorityTags: 추천에서 강조할 키워드(자유어, 한국어).",
    "- avoidances: 피하고 싶은 것(예: 혼잡, 긴 대기). 없으면 빈 배열.",
    "- summary: 사용자를 한 문장으로 따뜻하게 요약(반말).",
    "- routeStrategy: 동선을 어떻게 짤지 한 문장.",
    "- recommendationReason: 왜 이 동선인지 1~2문장(반말).",
    '- routeName: 짧고 구체적인 동선 이름("...코스" 형태).',
  ].join("\n");

  const raw = await generateJSON({
    prompt,
    schema: inferenceSchema,
    system: SYSTEM,
    temperature: 0.4,
  });

  const valid = new Set(categories.map((c) => c.slug));
  const interestsResolved = raw.interests
    .map((s) => s.trim())
    .filter((s) => valid.has(s));

  return { ...raw, interestsResolved };
}

/** 추론 결과를 InferredProfile(타입) 형태로 정규화. */
export function toInferredProfile(inf: OnboardingInference): InferredProfile {
  return {
    summary: inf.summary,
    priorityTags: inf.priorityTags,
    routeStrategy: inf.routeStrategy,
    recommendationReason: inf.recommendationReason,
  };
}
