// L4 메모리 — 로미가 예측한 취향을 사용자가 확인해준 정도(정확도). 순수·결정론,
// I/O 없음. "취향 %"는 여기서 나온다: 반응이 로미의 예측을 맞혔는지 채점한다.
//
// 채점 규칙: 자신 있다고 한 것만 틀렸을 때 깎인다. 부스가 사용자의 확신 가치(브레인
// confidence≥CONFIDENT_THRESHOLD)와 겹치면 confident, 아니면 uncertain — uncertain
// 부스는 맞으면 가산되고 틀려도 무해하다(낯선 부스를 찔러보는 탐색에 벌점을 주지 않는다).
import { CONFIDENT_THRESHOLD } from "@/lib/constants";
import { interestScore } from "@/lib/engine/scoring";
import type { Booth, BoothNote, UserBrain } from "@/lib/types";

export type JudgedClass = "confident" | "uncertain";

/** 부스가 사용자의 확신 가치와 겹치는지 — 판정 시점에 얼려서 저장한다. */
export function classifyBooth(booth: Booth, brain: UserBrain): JudgedClass {
  const confidentSlugs = brain.interests
    .filter((n) => n.confidence >= CONFIDENT_THRESHOLD)
    .map((n) => n.key);
  return interestScore(booth, confidentSlugs) > 0 ? "confident" : "uncertain";
}

/**
 * 반응(interest/verdict) → 채점 점수. 채점 대상이 아니면 null.
 *
 * verdict가 있으면 interest는 완전히 무시한다 — 몸으로 확인한 결과가 화면상의
 * 예측을 이긴다. "꼭 갈래(must)로 찍어놓고 가봤더니 아니었다(verdict=bad)"는
 * 결과가 -1이지, +1과 -1이 상쇄되지 않는다.
 */
export function judgmentScore(
  interest: BoothNote["interest"] | null | undefined,
  verdict: BoothNote["verdict"] | null | undefined,
  judgedClass: JudgedClass | null | undefined,
): number | null {
  // 판정 없이 쌓인 반응(소급 채점 금지)은 무조건 제외.
  if (judgedClass == null) return null;

  if (verdict) {
    switch (verdict) {
      case "good":
        return 1;
      case "ok":
        return 0;
      case "bad":
        return judgedClass === "confident" ? -1 : 0;
    }
  }

  switch (interest) {
    case "must":
      return 1;
    case "curious":
      return 0.6;
    case "pass":
      return judgedClass === "confident" ? -1 : 0;
    default:
      return null; // 해제(둘 다 없음)
  }
}

export interface TasteAccuracy {
  /** 채점 대상이 된 반응 수(전시 스코프). */
  judgedCount: number;
  /** 0~100. 판정이 임계값 미만이면 거짓 정밀도를 피하려고 null(말로만 표시). */
  pct: number | null;
}

/** 판정 5개 미만이면 숫자 대신 말로 보여준다(companion-bar.tsx). */
export const INSIGHT_THRESHOLD = 5;

/** 노트 목록(이미 전시로 스코프됨) → 정확도. 순수 집계, I/O 없음. */
export function computeTasteAccuracy(
  notes: {
    interest: BoothNote["interest"] | null | undefined;
    verdict: BoothNote["verdict"] | null | undefined;
    judgedClass: JudgedClass | null | undefined;
  }[],
): TasteAccuracy {
  const scores = notes
    .map((n) => judgmentScore(n.interest, n.verdict, n.judgedClass))
    .filter((s): s is number => s !== null);
  const judgedCount = scores.length;
  if (judgedCount < INSIGHT_THRESHOLD) return { judgedCount, pct: null };
  const sum = scores.reduce((a, b) => a + b, 0);
  // 점수 범위 -1..+1을 0..100으로: -1→0%, 0→50%, +1→100%.
  const pct = Math.round(((sum + judgedCount) / (2 * judgedCount)) * 100);
  return { judgedCount, pct: Math.max(0, Math.min(100, pct)) };
}
