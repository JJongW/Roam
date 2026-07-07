// Planner — 남은 시간·피로로 남은 동선을 재계획. 순수·결정론, LLM 없음.
// recomputeRoute(route.ts)와 형태는 같되, 소비 시간을 방문 dwell 근사가 아니라
// 실경과(elapsedMinutes)로 잡고 피로도로 남은 예산을 조인다.
import { REASONER_TUNING } from "@/lib/constants";
import type { MovementPreference, Point, ScoredBooth } from "@/lib/types";
import { clamp } from "@/lib/utils";
import { planRoute, type PlannedRoute } from "./route";

export interface ReplanInput {
  ranked: ScoredBooth[];
  visitedBoothIds: string[];
  current: Point;
  movementPreference: MovementPreference;
  budgetMinutes: number;
  elapsedMinutes: number;
  /** 0..1. 높을수록 남은 예산을 더 줄인다. */
  fatigue?: number;
}

/** 방문 제외 후 현재 위치에서 남은 시간(예산−경과, 피로 감쇠)만큼 재계획. */
export function replanRemaining(input: ReplanInput): PlannedRoute {
  const fatigue = clamp(input.fatigue ?? 0, 0, 1);
  const remaining = Math.max(0, input.budgetMinutes - input.elapsedMinutes);
  const effective = remaining * (1 - fatigue * REASONER_TUNING.fatiguePenalty);

  const visited = new Set(input.visitedBoothIds);
  const rest = input.ranked.filter((s) => !visited.has(s.booth.id));
  const replanned = planRoute(rest, {
    start: input.current,
    availableMinutes: effective,
    movementPreference: input.movementPreference,
  });

  return {
    boothIds: [...input.visitedBoothIds, ...replanned.boothIds],
    legs: replanned.legs,
    estimatedMinutes: replanned.estimatedMinutes,
    scores: replanned.scores,
  };
}
