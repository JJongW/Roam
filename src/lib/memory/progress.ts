// 로미의 "취향 파악도" 0~100 — L4 브레인에서 파생하는 순수 함수(결정론, I/O 없음).
// 기존 온보딩 스테이터스바를 대체: 로미가 사용자를 얼마나 이해했는지 스스로 인지한 값.
// 브레인이 영속되므로 이 값도 재접속·재계산에 그대로 유지된다(정직·영속).
import type { UserBrain } from "@/lib/types";

/**
 * 파악도 = 접촉량(본 부스 수) 중심 + 깊이(confidence) + 폭(관심 노드 수)의 혼합.
 * 완만한 곡선 — 100%(온보딩 종료)까지 대략 18~20번의 반응이 필요하도록 접촉량에
 * 무게를 둔다(몇 번 눌러 바로 끝나지 않게). 클라이언트 낙관 bump도 같은 포화 곡선을
 * 따라(감쇠) 재접속 시 값 점프를 줄인다.
 * - 양(volume): 본 부스 수, 16에서 포화 → 0.50 가중.
 * - 깊이(depth): 상위 4개 평균 confidence → 0.33 가중.
 * - 폭(breadth): confidence≥0.2 관심 노드 수, 6에서 포화 → 0.17 가중.
 */
export function tasteProgress(brain: UserBrain): number {
  const engaged = brain.interests.filter((n) => n.confidence >= 0.2);
  const depth = engaged.length
    ? engaged.slice(0, 4).reduce((s, n) => s + n.confidence, 0) /
      Math.min(4, engaged.length)
    : 0;
  const breadth = Math.min(engaged.length, 6) / 6;
  const seen = brain.literacy?.boothsSeenCount ?? 0;
  const volume = Math.min(seen, 16) / 16;
  const raw = 0.5 * volume + 0.33 * depth + 0.17 * breadth;
  return Math.max(0, Math.min(100, Math.round(raw * 100)));
}
