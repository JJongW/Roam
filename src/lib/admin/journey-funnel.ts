import type { UserSignal } from "@/lib/types";

export interface FunnelStage {
  stage: string;
  count: number;
  /** 직전 단계 대비 비율(%) — 1단계는 100. "어느 단계에서 새는가"를 보려면
   *  1단계 대비가 아니라 직전 단계 대비여야 한다(기존 analyticsConversion의
   *  버그 — admin-analytics-pm-layer 결정 문서 §0). */
  rate: number;
}

function distinctUserIds(signals: UserSignal[]): Set<string> {
  return new Set(signals.map((s) => s.userId));
}

/**
 * 로그인 → 가치 온보딩 → 피드 반응 → 현장 판정 → 회고 5단계 여정 퍼널.
 *
 * "가치 온보딩 완료"와 "피드 반응"은 둘 다 kind가 reaction_must/curious/pass일
 * 수 있어 kind만으로는 못 가른다 — 가치 온보딩 신호(POST /api/me/values →
 * recordSignal)는 boothId 없이 남기므로 boothCode가 없고, 피드에서 실제 부스에
 * 반응하면 항상 boothCode가 있다. 이 차이로 둘을 구분한다.
 */
export function computeJourneyFunnel(
  signals: UserSignal[],
  reflectedUserIds: Set<string>,
): FunnelStage[] {
  const entered = distinctUserIds(signals);
  const onboarded = distinctUserIds(
    signals.filter((s) => s.kind === "reaction_must" && !s.boothCode),
  );
  const reacted = distinctUserIds(
    signals.filter(
      (s) =>
        (s.kind === "reaction_must" ||
          s.kind === "reaction_curious" ||
          s.kind === "reaction_pass") &&
        s.boothCode,
    ),
  );
  const judged = distinctUserIds(
    signals.filter(
      (s) =>
        s.kind === "verdict_good" ||
        s.kind === "verdict_ok" ||
        s.kind === "verdict_bad",
    ),
  );

  const counts = [
    entered.size,
    onboarded.size,
    reacted.size,
    judged.size,
    reflectedUserIds.size,
  ];
  const labels = ["전시 진입", "가치 온보딩 완료", "피드 반응", "현장 판정", "관람 마치기"];

  return labels.map((stage, i) => ({
    stage,
    count: counts[i],
    rate:
      i === 0
        ? 100
        : counts[i - 1] > 0
          ? Number(((counts[i] / counts[i - 1]) * 100).toFixed(1))
          : 0,
  }));
}
