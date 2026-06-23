import {
  BASE_DWELL_MINUTES,
  MAX_PLANNED_STOPS,
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
  // more stops than a 1h one. The per-step budget check below is the hard limit.
  const slots = Math.floor(opts.availableMinutes / BASE_DWELL_MINUTES);
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
    const legCost = bestWalk + BASE_DWELL_MINUTES;
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
    // Total is WALKING time only — the one thing we can actually compute.
    // (Browsing time per booth is unknown, so we don't fabricate it.)
    total += walk;
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
    total += walk; // walking time only (browsing time is unknown)
    cur = booth;
    curId = booth.id;
  }
  return { boothIds, legs, estimatedMinutes: Math.round(total), scores };
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
    total += walk; // walking time only (browsing time is unknown)
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
