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
 * brain-sheet의 뮤트 해제 재시드(정확히 1개 slug만 보냄)는 온보딩이 아니라서
 * slugs.length>1로 한 번 더 걸러낸다 — 온보딩 퀴즈는 여러 문항을 종합해 항상
 * 복수 값을 보낸다.
 *
 * 알려진 한계: "회고" 단계는 user_brain.visits에서 직접 오고 나머지 네 단계는
 * signals에서 오기 때문에, 이론상 회고 인원이 그 앞 단계 인원보다 많을 수
 * 있다(그래도 표시되는 비율은 100%를 넘지 않게 clamp한다). 또한 앱 최초진입
 * 온보딩(전시 맥락 없음)은 첫 번째 전시로 귀속돼, 다른 전시에서는 "가치 온보딩
 * 완료"가 실제보다 적게 잡힐 수 있다 — 근본 해결은 온보딩 신호에 전시 맥락을
 * 제대로 붙이는 것이고, 이번 범위 밖이다(구조적 후속 과제).
 */
export function computeJourneyFunnel(
  signals: UserSignal[],
  reflectedUserIds: Set<string>,
): FunnelStage[] {
  const entered = distinctUserIds(signals);
  const onboarded = distinctUserIds(
    signals.filter(
      (s) => s.kind === "reaction_must" && !s.boothCode && s.slugs.length > 1,
    ),
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
  const labels = [
    "전시 진입",
    "가치 온보딩 완료",
    "피드 반응",
    "현장 판정",
    "관람 마치기",
  ];

  return labels.map((stage, i) => ({
    stage,
    count: counts[i],
    rate:
      i === 0
        ? 100
        : counts[i - 1] > 0
          ? Math.min(
              100,
              Number(((counts[i] / counts[i - 1]) * 100).toFixed(1)),
            )
          : 0,
  }));
}
