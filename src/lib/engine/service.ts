import { getRepository } from "@/lib/repositories";
import { rankBooths, type ScoreContext } from "@/lib/engine/scoring";
import { planRoute, type PlannedRoute } from "@/lib/engine/route";
import type { UserPreferenceInput } from "@/lib/schemas";
import type {
  Booth,
  BoothEvent,
  Point,
  ScoredBooth,
  Waiting,
} from "@/lib/types";

export interface RankResult {
  exhibitionId: string;
  ranked: ScoredBooth[];
  booths: Booth[];
  waitingByBooth: Record<string, Waiting | undefined>;
  eventsByBooth: Record<string, BoothEvent[]>;
}

/** Fetch booths/waiting/events for an exhibition and rank them for a preference. */
export async function rankForExhibition(
  exhibitionSlug: string,
  preference: UserPreferenceInput,
  nowMs: number = Date.now(),
): Promise<RankResult | null> {
  const repo = await getRepository();
  const detail = await repo.getExhibition(exhibitionSlug);
  if (!detail) return null;

  const booths = await repo.listBoothsByExhibitionId(detail.exhibition.id);
  const events = await repo.listEvents(exhibitionSlug);

  const waitingByBooth: Record<string, Waiting | undefined> = {};
  const eventsByBooth: Record<string, BoothEvent[]> = {};
  for (const e of events) (eventsByBooth[e.boothId] ??= []).push(e);
  for (const w of await repo.listWaitings(detail.exhibition.id))
    waitingByBooth[w.boothId] = w;

  const ctx: ScoreContext = {
    preference,
    waitingByBooth,
    eventsByBooth,
    now: nowMs,
  };

  return {
    exhibitionId: detail.exhibition.id,
    ranked: rankBooths(booths, ctx),
    booths,
    waitingByBooth,
    eventsByBooth,
  };
}

/** Build a route plan from a ranking, honoring the start booth if given. */
export function buildPlan(
  rank: RankResult,
  preference: UserPreferenceInput,
  start?: Point,
): PlannedRoute {
  return planRoute(rank.ranked, {
    movementPreference: preference.movementPreference,
    availableMinutes: preference.availableMinutes,
    start,
    waitingByBooth: rank.waitingByBooth,
  });
}
