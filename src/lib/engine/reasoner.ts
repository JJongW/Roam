// Reasoner — 관람 진행에서 피로도를 추론. 순수·결정론, I/O 없음, LLM 없음.
// 방문 진행률과 경과 시간률의 가중합(0..1). Planner가 남은 예산을 조절할 때 쓴다.
import { REASONER_TUNING } from "@/lib/constants";
import { clamp } from "@/lib/utils";

export interface FatigueInput {
  boothsVisited: number;
  plannedStops: number;
  elapsedMinutes: number;
  budgetMinutes: number;
}

/** 피로도 0..1. 많이 봤고 오래 걸었을수록 높다. */
export function assessFatigue(input: FatigueInput): number {
  const visitedRatio =
    input.plannedStops > 0 ? input.boothsVisited / input.plannedStops : 0;
  const elapsedRatio =
    input.budgetMinutes > 0 ? input.elapsedMinutes / input.budgetMinutes : 0;
  return clamp(
    REASONER_TUNING.visitedWeight * visitedRatio +
      REASONER_TUNING.elapsedWeight * elapsedRatio,
    0,
    1,
  );
}
