// 관람 종료 대화에서 로미가 던질 질문을 고른다. 순수·LLM 없음.
//
// 왜 필요한가: 클릭·반응으로 알 수 있는 건 "무엇에 끌렸는가"까지다. 어떻게 보고
// 싶은지(깊게/넓게), 사람 많은 걸 견디는지, 누구와 오는지는 **물어야만** 안다.
// UserBrain.preferences에 그 자리가 5개 있는데 지금까지 아무것도 채우지 않았다
// (distill.ts가 {}로 초기화만 하고 끝) — 관람 종료가 그걸 채울 자리다.
//
// 한 번에 다 묻지 않는다. 관람 끝에 5문항을 들이밀면 설문이 되고, 그건 동행이 아니다.
// 아직 비어 있는 것 중 **하나만** 고른다.
import type { UserBrain } from "@/lib/types";

export type PreferenceKey =
  | "depthVsBreadth"
  | "crowdTolerance"
  | "companion"
  | "movement"
  | "waitTolerance";

export interface ReflectQuestion {
  key: PreferenceKey;
  /** 로미가 던지는 말(반말). */
  prompt: string;
  /** 고를 수 있는 답 — 라벨과 저장값. */
  options: { label: string; value: string | number }[];
}

/**
 * 물어볼 순서. 앞쪽일수록 추천에 영향이 크다 —
 * 깊게/넓게가 부스 수를 정하고, 혼잡 민감도가 동선을 정한다.
 */
const ORDER: PreferenceKey[] = [
  "depthVsBreadth",
  "crowdTolerance",
  "companion",
  "movement",
  "waitTolerance",
];

const QUESTIONS: Record<string, Omit<ReflectQuestion, "key">> = {
  depthVsBreadth: {
    prompt: "오늘 같은 관람, 다음에도 이런 식이 좋아?",
    options: [
      { label: "몇 곳만 깊게", value: 0 },
      { label: "많이 둘러보기", value: 1 },
      { label: "반반", value: 0.5 },
    ],
  },
  crowdTolerance: {
    prompt: "사람 많은 구역은 어땠어?",
    options: [
      { label: "붐비면 지쳐", value: 0.2 },
      { label: "괜찮았어", value: 0.8 },
      { label: "그럭저럭", value: 0.5 },
    ],
  },
  companion: {
    prompt: "오늘은 어떻게 봤어?",
    options: [
      { label: "혼자", value: "alone" },
      { label: "친구랑", value: "friend" },
      { label: "가족과", value: "family" },
    ],
  },
  movement: {
    prompt: "다음엔 어떻게 움직이는 게 편할까?",
    options: [
      { label: "적게 걷기", value: "minimal" },
      { label: "많이 봐도 괜찮아", value: "active" },
      { label: "적당히", value: "balanced" },
    ],
  },
  waitTolerance: {
    prompt: "줄 서는 건 어때?",
    options: [
      { label: "줄은 피하고 싶어", value: 0.2 },
      { label: "기다릴 수 있어", value: 0.8 },
      { label: "상황 봐서", value: 0.5 },
    ],
  },
};

/**
 * 아직 답하지 않은 것 중 가장 영향이 큰 질문 하나. 다 채워졌으면 null —
 * 그때는 더 묻지 않는다(같은 걸 또 묻는 게 가장 빨리 신뢰를 깎는다).
 */
export function nextReflectQuestion(
  brain: UserBrain | null,
): ReflectQuestion | null {
  const p = brain?.preferences ?? {};
  for (const key of ORDER) {
    if ((p as Record<string, unknown>)[key] === undefined) {
      return { key, ...QUESTIONS[key] };
    }
  }
  return null;
}

/**
 * 답을 브레인 preferences에 반영한 새 브레인. 순수(입력을 바꾸지 않는다).
 * 모르는 키는 무시한다 — 클라가 보낸 값을 그대로 믿지 않는다.
 */
export function applyReflectAnswer(
  brain: UserBrain,
  key: string,
  value: string | number,
): UserBrain {
  if (!ORDER.includes(key as PreferenceKey)) return brain;
  const allowed = QUESTIONS[key].options.map((o) => o.value);
  if (!allowed.includes(value)) return brain;
  return {
    ...brain,
    preferences: { ...brain.preferences, [key]: value },
    updatedAt: brain.updatedAt,
  };
}

/**
 * 마무리 한 줄 — 오늘 반응이 다음 전시를 어떻게 바꾸는지 구체로 말한다.
 * "잘 봤다"가 아니라 "다음엔 이렇게 해줄게"여야 관람이 닫힌다(peak-end).
 * 재료가 없으면 null — 지어내지 않는다.
 */
export function closingLine(
  topThemeLabels: string[],
  answered: ReflectQuestion | null,
  answerLabel?: string,
): string | null {
  const parts: string[] = [];
  if (topThemeLabels.length > 0) {
    parts.push(`오늘은 ${topThemeLabels.slice(0, 2).join("·")} 쪽에 가장 많이 반응했어`);
  }
  if (answered && answerLabel) {
    parts.push(`'${answerLabel}'도 기억해둘게`);
  }
  if (parts.length === 0) return null;
  return `${parts.join(". ")}. 다음 전시는 여기서부터 골라줄게.`;
}
