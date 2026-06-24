import { getRepository } from "@/lib/repositories";
import { exhibitorBooths } from "@/lib/booth/normalize";
import { rankBooths, type ScoreContext } from "@/lib/engine/scoring";
import { planRoute, type PlannedRoute } from "@/lib/engine/route";
import type { UserPreferenceInput } from "@/lib/schemas";
import type { Booth, BoothEvent, Point, ScoredBooth } from "@/lib/types";

export interface RankResult {
  exhibitionId: string;
  ranked: ScoredBooth[];
  booths: Booth[];
  eventsByBooth: Record<string, BoothEvent[]>;
}

/** Fetch booths/events for an exhibition and rank them for a preference. */
export async function rankForExhibition(
  exhibitionSlug: string,
  preference: UserPreferenceInput,
  nowMs: number = Date.now(),
): Promise<RankResult | null> {
  const repo = await getRepository();
  const detail = await repo.getExhibition(exhibitionSlug);
  if (!detail) return null;

  // Recommend exhibitors only — facility areas (lounge/stage) never get ranked.
  const booths = exhibitorBooths(
    await repo.listBoothsByExhibitionId(detail.exhibition.id),
  );
  const events = await repo.listEvents(exhibitionSlug);

  const eventsByBooth: Record<string, BoothEvent[]> = {};
  for (const e of events) (eventsByBooth[e.boothId] ??= []).push(e);

  // Crowd signal from real saved routes — normalized to 0..1. Empty at first;
  // sharpens as visitors build routes (usage → better recommendations).
  const heat = await repo.boothHeatmap(detail.exhibition.id);
  const maxCount = Math.max(1, ...Object.values(heat.booths));
  const crowdByBooth: Record<string, number> = {};
  for (const [id, c] of Object.entries(heat.booths))
    crowdByBooth[id] = c / maxCount;

  const ctx: ScoreContext = {
    preference,
    eventsByBooth,
    now: nowMs,
    crowdByBooth,
  };

  return {
    exhibitionId: detail.exhibition.id,
    ranked: rankBooths(booths, ctx),
    booths,
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
  });
}
