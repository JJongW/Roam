import {
  BASE_DWELL_MINUTES,
  MAX_PLANNED_STOPS,
  MIN_DWELL_MINUTES,
  MOVEMENT_TUNING,
  WALK_UNITS_PER_MINUTE,
} from "@/lib/constants";
import { distance } from "@/lib/engine/scoring";
import type {
  Booth,
  Point,
  RouteLeg,
  ScoredBooth,
  UserPreference,
} from "@/lib/types";

/** 부스 체류 시간(분) — 크기로 주입된 값, 없으면 평균 기본값. */
function dwell(booth: Booth): number {
  return booth.dwellMinutes ?? BASE_DWELL_MINUTES;
}

export interface PlannedRoute {
  boothIds: string[];
  legs: RouteLeg[];
  estimatedMinutes: number;
  scores: Record<string, number>;
}

export interface PlanOptions {
  movementPreference: UserPreference["movementPreference"];
  availableMinutes: number;
  start?: Point;
}

function walkMinutes(a: Point, b: Point): number {
  return distance(a, b) / WALK_UNITS_PER_MINUTE;
}

/**
 * Greedy time-budgeted route planner.
 * Repeatedly picks the booth maximizing (score · coverageBias − walkPenalty · walkTime)
 * from the current position, until the time budget or max stops is exhausted.
 * Pure + deterministic given equal inputs.
 */
export function planRoute(
  ranked: ScoredBooth[],
  opts: PlanOptions,
): PlannedRoute {
  const tuning = MOVEMENT_TUNING[opts.movementPreference];
  const start: Point = opts.start ?? { x: 0, y: 0 };

  // Stop count scales with the TIME budget (not a fixed cap): how many ~dwell
  // slots fit, modulated by the movement density. A 3h visit thus plans many
  // more stops than a 1h one. Uses the MIN dwell so the cap reflects the densest
  // (all-small-booths) case — the per-step budget check below is the real limit.
  const slots = Math.floor(opts.availableMinutes / MIN_DWELL_MINUTES);
  const maxStops = Math.max(
    1,
    Math.min(MAX_PLANNED_STOPS, Math.round(slots * tuning.density)),
  );

  const remaining = new Map(ranked.map((s) => [s.booth.id, s]));
  const scores: Record<string, number> = Object.fromEntries(
    ranked.map((s) => [s.booth.id, s.score]),
  );

  // --- 1) Select WHICH booths to visit (greedy: score, time-budgeted) -------
  const selected: Booth[] = [];
  let cursor: Point = start;
  let spent = 0;
  while (remaining.size > 0 && selected.length < maxStops) {
    let best: ScoredBooth | null = null;
    let bestValue = -Infinity;
    let bestWalk = 0;
    for (const cand of remaining.values()) {
      const walk = walkMinutes(cursor, cand.booth);
      const value =
        cand.score * tuning.coverageBias - tuning.walkPenalty * walk;
      if (value > bestValue) {
        bestValue = value;
        best = cand;
        bestWalk = walk;
      }
    }
    if (!best) break;
    const legCost = bestWalk + dwell(best.booth);
    if (spent + legCost > opts.availableMinutes && selected.length > 0) {
      remaining.delete(best.booth.id);
      continue;
    }
    selected.push(best.booth);
    spent += legCost;
    cursor = best.booth;
    remaining.delete(best.booth.id);
  }

  // --- 2) ORDER them as a clean nearest-neighbour sweep from the entrance ----
  const pool = [...selected];
  const ordered: Booth[] = [];
  let at: Point = start;
  while (pool.length > 0) {
    let bi = 0;
    let bd = Infinity;
    for (let i = 0; i < pool.length; i++) {
      const d = distance(at, pool[i]);
      if (d < bd) {
        bd = d;
        bi = i;
      }
    }
    const next = pool.splice(bi, 1)[0];
    ordered.push(next);
    at = next;
  }

  // --- 3) Build legs along the ordered path ---------------------------------
  const boothIds: string[] = [];
  const legs: RouteLeg[] = [];
  let cur: Point = start;
  let curId = "start";
  let total = 0;
  for (const booth of ordered) {
    const walk = walkMinutes(cur, booth);
    // leg.minutes = walking time only (shown as "이동"); total adds browsing.
    legs.push({
      from: curId,
      to: booth.id,
      minutes: Number(walk.toFixed(2)),
      distance: Number(distance(cur, booth).toFixed(1)),
    });
    boothIds.push(booth.id);
    // Total = walking + per-booth dwell (size-based: small 3 / large 10).
    total += walk + dwell(booth);
    cur = booth;
    curId = booth.id;
  }

  return { boothIds, legs, estimatedMinutes: Math.round(total), scores };
}

/**
 * Build a route from a manually chosen set of booths: order them as a
 * nearest-neighbour sweep from the entrance and compute legs. Pure — used for
 * client-side route editing (add/remove booth).
 */
export function buildManualRoute(
  booths: Booth[],
  start: Point,
  scores: Record<string, number> = {},
): PlannedRoute {
  const pool = [...booths];
  const ordered: Booth[] = [];
  let at: Point = start;
  while (pool.length > 0) {
    let bi = 0;
    let bd = Infinity;
    for (let i = 0; i < pool.length; i++) {
      const d = distance(at, pool[i]);
      if (d < bd) {
        bd = d;
        bi = i;
      }
    }
    ordered.push(pool.splice(bi, 1)[0]);
    at = ordered[ordered.length - 1];
  }
  const boothIds: string[] = [];
  const legs: RouteLeg[] = [];
  let cur: Point = start;
  let curId = "start";
  let total = 0;
  for (const booth of ordered) {
    const walk = walkMinutes(cur, booth);
    legs.push({
      from: curId,
      to: booth.id,
      minutes: Number(walk.toFixed(2)),
      distance: Number(distance(cur, booth).toFixed(1)),
    });
    boothIds.push(booth.id);
    total += walk + dwell(booth); // walking + size-based dwell
    cur = booth;
    curId = booth.id;
  }
  return { boothIds, legs, estimatedMinutes: Math.round(total), scores };
}

/**
 * Hall-aware sweep ordering. 부스를 홀(hallId)별로 묶고, 입구에서 가까운 홀부터
 * 방문하되 각 홀 안에서는 직전 위치 기준 최근접 순서로 돈다. 홀 간 전환은 정확히
 * 홀 개수-1번만 일어나 A↔B 왕복(지그재그)을 막는다. 순수.
 *
 * 일반 NN(buildOrderedRoute의 입력이 흩어졌을 때)은 홀 경계를 넘나들며 튈 수
 * 있어, LLM/엔진이 양쪽 홀 부스를 섞어 골랐을 때 이 정렬을 쓴다.
 */
export function buildHallSweepRoute(
  booths: Booth[],
  start: Point,
  scores: Record<string, number> = {},
  end?: Point,
): PlannedRoute {
  // 홀별 그룹.
  const groups = new Map<string, Booth[]>();
  for (const b of booths) {
    const key = b.hallId || "_";
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(b);
  }
  // 각 홀의 무게중심까지 거리로 홀 방문 순서를 정한다(입구에서 가까운 홀 먼저).
  // 출구(end)가 주어지면 출구에 가까운 홀일수록 뒤로 미뤄, 입구→…→출구로 자연히
  // 흐르게 한다(경로 TSP의 가벼운 근사).
  const centroid = (list: Booth[]): Point => ({
    x: list.reduce((s, b) => s + b.x, 0) / list.length,
    y: list.reduce((s, b) => s + b.y, 0) / list.length,
  });
  const hallKey = (list: Booth[]): number => {
    const c = centroid(list);
    return end ? distance(start, c) - distance(end, c) : distance(start, c);
  };
  const hallOrder = [...groups.entries()].sort(
    (a, b) => hallKey(a[1]) - hallKey(b[1]),
  );
  // 각 홀 안에서 직전 위치 기준 최근접 스윕, 다음 홀로 이어붙임.
  const ordered: Booth[] = [];
  let at: Point = start;
  for (const [, list] of hallOrder) {
    const pool = [...list];
    while (pool.length > 0) {
      let bi = 0;
      let bd = Infinity;
      for (let i = 0; i < pool.length; i++) {
        const d = distance(at, pool[i]);
        if (d < bd) {
          bd = d;
          bi = i;
        }
      }
      const next = pool.splice(bi, 1)[0];
      ordered.push(next);
      at = next;
    }
  }
  return buildOrderedRoute(ordered, start, scores);
}

/**
 * Build a route from booths in the EXACT given order (no reordering). Used when
 * the visitor has manually arranged their stops. Pure.
 */
export function buildOrderedRoute(
  booths: Booth[],
  start: Point,
  scores: Record<string, number> = {},
): PlannedRoute {
  const boothIds: string[] = [];
  const legs: RouteLeg[] = [];
  let cur: Point = start;
  let curId = "start";
  let total = 0;
  for (const booth of booths) {
    const walk = walkMinutes(cur, booth);
    legs.push({
      from: curId,
      to: booth.id,
      minutes: Number(walk.toFixed(2)),
      distance: Number(distance(cur, booth).toFixed(1)),
    });
    boothIds.push(booth.id);
    total += walk + dwell(booth); // walking + size-based dwell
    cur = booth;
    curId = booth.id;
  }
  return { boothIds, legs, estimatedMinutes: Math.round(total), scores };
}

/**
 * Recompute the remaining route from a deviation point (Phase 2).
 * Keeps visited booths, replans the rest from the current position.
 */
export function recomputeRoute(
  ranked: ScoredBooth[],
  visitedBoothIds: string[],
  current: Point,
  opts: PlanOptions,
): PlannedRoute {
  const visited = new Set(visitedBoothIds);
  const rest = ranked.filter((s) => !visited.has(s.booth.id));
  const spentSoFar = visitedBoothIds.length * BASE_DWELL_MINUTES;
  const replanned = planRoute(rest, {
    ...opts,
    start: current,
    availableMinutes: Math.max(0, opts.availableMinutes - spentSoFar),
  });
  return {
    boothIds: [...visitedBoothIds, ...replanned.boothIds],
    legs: replanned.legs,
    estimatedMinutes: replanned.estimatedMinutes,
    scores: replanned.scores,
  };
}

/** Did the visitor stray from the planned path? distance to next booth vs threshold. */
export function isDeviated(
  position: Point,
  nextBooth: Booth | undefined,
  thresholdUnits = 250,
): boolean {
  if (!nextBooth) return false;
  return distance(position, nextBooth) > thresholdUnits;
}
