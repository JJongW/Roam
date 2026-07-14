// 로미의 "취향 파악도" 0~100 — L4 브레인에서 파생하는 순수 함수(결정론, I/O 없음).
// 기존 온보딩 스테이터스바를 대체: 로미가 사용자를 얼마나 이해했는지 스스로 인지한 값.
// 브레인이 영속되므로 이 값도 재접속·재계산에 그대로 유지된다(정직·영속).
import type { UserBrain } from "@/lib/types";

/**
 * 파악도 = 관심 폭(engaged) + 깊이(confidence) + 접촉량(본 부스 수)의 혼합.
 * - 폭: confidence≥0.25 관심 노드 수(상한 기여).
 * - 깊이: 상위 4개 평균 confidence.
 * - 양: 본 부스 수(포화 10).
 * 반응이 쌓일수록(브레인 갱신) 자연히 오르고 100에서 포화한다.
 */
export function tasteProgress(brain: UserBrain): number {
  const engaged = brain.interests.filter((n) => n.confidence >= 0.25);
  const avgConf = engaged.length
    ? engaged.slice(0, 4).reduce((s, n) => s + n.confidence, 0) /
      Math.min(4, engaged.length)
    : 0;
  const seen = brain.literacy?.boothsSeenCount ?? 0;
  const volume = Math.min(seen, 10) / 10; // 0..1
  const raw = engaged.length * 11 + avgConf * 45 + volume * 22;
  return Math.max(0, Math.min(100, Math.round(raw)));
}
