/**
 * Playful, on-brand loading copy. A wait under ~0.5s shows nothing; anything
 * longer should show one of these (with a skeleton/spinner) so the visitor never
 * stares at a blank, frozen-feeling screen. Grouped by what's being fetched.
 */
export const LOADING_MESSAGES = {
  /** 취향 파악·부스 큐레이션 대기. LLM 주도 파이프라인(검색·URL·RAG)이라 몇 초
   *  걸릴 수 있어 단계가 진행되는 느낌을 준다. 키 이름 `route`는 히스토리 잔재다 —
   *  동선 제품은 폐기됐고 발화에 동선·효율 프레이밍을 쓰지 않는다
   *  (docs/brand/02_voice-tone.md §4-4). */
  route: [
    "어떤 걸 좋아하실지 곰곰이 살펴보는 중이에요",
    "관심사에 맞는 부스를 찾는 중이에요",
    "현장 굿즈와 부스 소식을 확인하는 중이에요",
    "웹에서 관련 정보를 검색하는 중이에요",
    "잘 맞을 만한 부스를 고르는 중이에요",
    "붐비는 시간대를 피할 수 있나 보는 중이에요",
  ],
  /** Booth highlights — 신간 · 굿즈. */
  goods: [
    "따끈따끈한 굿즈를 불러오는 중이에요",
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
