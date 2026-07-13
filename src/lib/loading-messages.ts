/**
 * Playful, on-brand loading copy. A wait under ~0.5s shows nothing; anything
 * longer should show one of these (with a skeleton/spinner) so the visitor never
 * stares at a blank, frozen-feeling screen. Grouped by what's being fetched.
 */
export const LOADING_MESSAGES = {
  /** Building or re-recommending a 동선 (onboarding, AI quick-route). LLM 주도
   *  파이프라인(검색·URL·RAG)이라 몇 초 걸릴 수 있어 단계가 진행되는 느낌을 준다. */
  route: [
    "네가 뭘 좋아할지 곰곰이 살펴보는 중이야",
    "관심사에 맞는 부스를 찾는 중이야",
    "현장 굿즈랑 부스 소식을 확인하는 중이야",
    "웹에서 관련 정보를 검색하는 중이야",
    "가장 잘 맞는 부스를 고르는 중이야",
    "혼잡을 피해 동선을 이어보는 중이야",
  ],
  /** Booth highlights — 신간 · 굿즈. */
  goods: [
    "따끈따끈한 굿즈들을 불러오는 중이야",
    "어떤 신간이 나왔는지 살펴보는 중이야",
    "부스 소식을 정리하는 중이야",
  ],
  /** Crowd heatmap. */
  crowd: [
    "방문객들이 많이 간 곳을 모으는 중이야",
    "붐비는 부스를 살펴보는 중이야",
  ],
} as const;

export type LoadingTopic = keyof typeof LOADING_MESSAGES;
