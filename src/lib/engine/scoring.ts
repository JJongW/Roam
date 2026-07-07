import { COMPANION_WEIGHTS, mergePurposeWeights } from "@/lib/constants";
import { boothValueSlugs } from "@/lib/values";
import type {
  Booth,
  BoothEvent,
  Point,
  ScoredBooth,
  UserPreference,
} from "@/lib/types";

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Interest overlap, 0..1 — graded so scores SPREAD instead of bunching at a few
 * values (the old formula was near-binary → mass ties → identical candidate
 * pools). Blends two granular signals:
 *   · coverage = how many of the visitor's interests this booth hits (intent fit)
 *   · focus    = how on-topic the booth is (hits / its own tag count)
 * A single generic match scores modestly; a booth that is squarely on several of
 * the visitor's interests scores near 1. This separation is what lets different
 * inputs surface different booths.
 */
export function interestScore(
  booth: Booth,
  interests: string[],
  /** slug별 가중치(없으면 1). L4 브레인 관심에 confidence 가중을 실어 누적 관심이
   *  세션 의도보다 무겁게 반영되도록 한다. 미지정이면 기존과 동일(전부 1). */
  weights?: Record<string, number>,
): number {
  const boothTags = boothValueSlugs(booth); // 가치 축(없으면 분야 폴백)
  if (interests.length === 0 || boothTags.length === 0) return 0;
  const set = new Set(interests);
  const w = (slug: string) => weights?.[slug] ?? 1;
  let weightedHits = 0;
  let hitCount = 0;
  for (const t of boothTags) {
    if (set.has(t)) {
      weightedHits += w(t);
      hitCount++;
    }
  }
  if (hitCount === 0) return 0;
  const totalWeight = interests.reduce((s, slug) => s + w(slug), 0);
  const coverage = totalWeight > 0 ? weightedHits / totalWeight : 0; // 가중 커버리지 0..1
  const focus = hitCount / boothTags.length; // share of booth that's on-topic, 0..1
  return Math.min(1, 0.45 * coverage + 0.4 * focus + 0.15);
}

/** Stable per-id hash → 0..1. Used as the ranking tie-break so equal scores
 *  don't always favour alphabetically-first ids (which clustered the candidate
 *  pool on one prefix/hall). Deterministic, spreads ties across the venue. */
function idHash(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
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
    "visitPurposes" | "interests" | "availableMinutes" | "companionType"
  >;
  eventsByBooth: Record<string, BoothEvent[]>;
  now: number;
  /** Crowd popularity per booth (0..1), aggregated from real saved routes. As
   *  more visitors build routes, this sharpens — the recommendation improves
   *  with usage. Blended with the booth's static popularity. */
  crowdByBooth?: Record<string, number>;
  /** interest slug별 가중치(L4 브레인 누적 관심). 미지정이면 전부 1(기존 동작). */
  interestWeights?: Record<string, number>;
}

export function scoreBooth(booth: Booth, ctx: ScoreContext): ScoredBooth {
  // Purpose sets the base weighting; companion tilts it (who's visiting).
  const pw = mergePurposeWeights(ctx.preference.visitPurposes);
  const cw = COMPANION_WEIGHTS[ctx.preference.companionType];
  const w = {
    interest: pw.interest * cw.interest,
    popularity: pw.popularity * cw.popularity,
    event: pw.event * cw.event,
  };
  const interest = interestScore(
    booth,
    ctx.preference.interests,
    ctx.interestWeights,
  );
  // Static popularity, blended with live crowd signal when available, so the
  // recommendation gets better as more visitors save routes.
  const staticPop = booth.popularity / 100;
  const crowd = ctx.crowdByBooth?.[booth.id];
  const popularity =
    crowd != null ? 0.55 * staticPop + 0.45 * crowd : staticPop;
  const event = eventBoost(
    ctx.eventsByBooth[booth.id] ?? [],
    ctx.now,
    ctx.preference.availableMinutes,
  );

  const score =
    w.interest * interest + w.popularity * popularity + w.event * event;

  return {
    booth,
    score: Number(score.toFixed(4)),
    breakdown: { interest, popularity, event },
  };
}

/** Rank booths by score, descending. Tie-break by a stable id hash (not
 *  alphabetical) so equal-scored booths don't cluster on one prefix/hall. */
export function rankBooths(booths: Booth[], ctx: ScoreContext): ScoredBooth[] {
  return booths
    .map((b) => scoreBooth(b, ctx))
    .sort(
      (a, b) => b.score - a.score || idHash(a.booth.id) - idHash(b.booth.id),
    );
}

/**
 * Pick a DIVERSE top-N from a ranking via MMR (maximal marginal relevance):
 * greedily take the best-scoring booth, then penalise later picks whose tags are
 * already represented — so the pool spans categories instead of N near-clones of
 * the single highest-scoring category. This is the main lever against "every
 * recommendation looks the same": the LLM reranker only sees what we hand it, so
 * we hand it variety. Pure + deterministic. `lambda` trades relevance (1) vs
 * diversity (0).
 */
export function diversifyCandidates(
  ranked: ScoredBooth[],
  n: number,
  lambda = 0.75,
): ScoredBooth[] {
  if (ranked.length <= n) return ranked.slice();
  const pool = ranked.slice();
  const picked: ScoredBooth[] = [];
  const covered = new Set<string>();
  while (picked.length < n && pool.length > 0) {
    let bi = 0;
    let bestValue = -Infinity;
    for (let i = 0; i < pool.length; i++) {
      const b = pool[i].booth;
      const overlap = boothValueSlugs(b).filter((t) => covered.has(t)).length;
      const value = lambda * pool[i].score - (1 - lambda) * overlap;
      if (value > bestValue) {
        bestValue = value;
        bi = i;
      }
    }
    const chosen = pool.splice(bi, 1)[0];
    picked.push(chosen);
    for (const t of boothValueSlugs(chosen.booth)) covered.add(t);
  }
  return picked;
}
