import { COMPANION_WEIGHTS, PURPOSE_WEIGHTS } from "@/lib/constants";
import type {
  Booth,
  BoothEvent,
  Point,
  ScoredBooth,
  UserPreference,
  Waiting,
} from "@/lib/types";

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Interest overlap, 0..1. Tags matching selected interests, normalized. */
export function interestScore(booth: Booth, interests: string[]): number {
  if (interests.length === 0) return 0;
  const set = new Set(interests);
  const hits = booth.tags.filter((t) => set.has(t)).length;
  // reward any match strongly, scale gently with more matches
  if (hits === 0) return 0;
  return Math.min(
    1,
    0.6 + 0.2 * (hits - 1) + 0.2 * (hits / booth.tags.length || 0),
  );
}

/** Waiting penalty 0..1 — longer queues hurt, weighted by movement pref later. */
export function waitingPenalty(waiting?: Waiting): number {
  if (!waiting || !waiting.enabled) return 0;
  return Math.min(1, waiting.estimatedMinutes / 30); // 30+ min wait = max penalty
}

/** Event boost 0..1 if an event overlaps the visit window [now, now+budget]. */
export function eventBoost(
  events: BoothEvent[],
  now: number,
  windowMinutes: number,
): number {
  if (events.length === 0) return 0;
  const windowEnd = now + windowMinutes * 60_000;
  const active = events.some((e) => {
    const start = Date.parse(e.startTime);
    const end = Date.parse(e.endTime);
    return end >= now && start <= windowEnd;
  });
  return active ? 1 : 0.3; // upcoming-but-outside-window still mildly boosts
}

export interface ScoreContext {
  preference: Pick<
    UserPreference,
    "visitPurpose" | "interests" | "availableMinutes" | "companionType"
  >;
  waitingByBooth: Record<string, Waiting | undefined>;
  eventsByBooth: Record<string, BoothEvent[]>;
  now: number;
}

export function scoreBooth(booth: Booth, ctx: ScoreContext): ScoredBooth {
  // Purpose sets the base weighting; companion tilts it (who's visiting).
  const pw = PURPOSE_WEIGHTS[ctx.preference.visitPurpose];
  const cw = COMPANION_WEIGHTS[ctx.preference.companionType];
  const w = {
    interest: pw.interest * cw.interest,
    popularity: pw.popularity * cw.popularity,
    event: pw.event * cw.event,
    waiting: pw.waiting * cw.waiting,
  };
  const interest = interestScore(booth, ctx.preference.interests);
  const popularity = booth.popularity / 100;
  const event = eventBoost(
    ctx.eventsByBooth[booth.id] ?? [],
    ctx.now,
    ctx.preference.availableMinutes,
  );
  const penalty = waitingPenalty(ctx.waitingByBooth[booth.id]);

  const score =
    w.interest * interest +
    w.popularity * popularity +
    w.event * event -
    w.waiting * penalty;

  return {
    booth,
    score: Number(score.toFixed(4)),
    breakdown: { interest, popularity, event, waitingPenalty: penalty },
  };
}

/** Rank booths by score, descending. Deterministic tie-break by id. */
export function rankBooths(booths: Booth[], ctx: ScoreContext): ScoredBooth[] {
  return booths
    .map((b) => scoreBooth(b, ctx))
    .sort((a, b) => b.score - a.score || a.booth.id.localeCompare(b.booth.id));
}
