/**
 * Playful, on-brand loading copy. A wait under ~0.5s shows nothing; anything
 * longer should show one of these (with a skeleton/spinner) so the visitor never
 * stares at a blank, frozen-feeling screen. Grouped by what's being fetched.
 */
export const LOADING_MESSAGES = {
  /** Building or re-recommending a 동선 (onboarding, AI quick-route). */
  route: [
    "딱 맞는 동선을 짜는 중이에요",
    "혼잡을 피해 길을 고르는 중이에요",
    "관심사에 맞춰 부스를 고르는 중이에요",
    "최단 경로로 이어보는 중이에요",
  ],
  /** Booth highlights — 신간 · 굿즈. */
  goods: [
    "따끈따끈한 굿즈들을 불러오는 중이에요",
    "어떤 신간이 나왔는지 살펴보는 중이에요",
    "부스 소식을 정리하는 중이에요",
  ],
  /** Crowd heatmap. */
  crowd: [
    "방문객들이 많이 간 곳을 모으는 중이에요",
    "붐비는 부스를 살펴보는 중이에요",
  ],
} as const;

export type LoadingTopic = keyof typeof LOADING_MESSAGES;
