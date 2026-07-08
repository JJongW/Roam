import { getRepository } from "@/lib/repositories";
import { exhibitorBooths } from "@/lib/booth/normalize";
import { attachDwellMinutes } from "@/lib/booth/dwell";
import { rankBooths, type ScoreContext } from "@/lib/engine/scoring";
import type { UserPreferenceInput } from "@/lib/schemas";
import type { Booth, BoothEvent, ScoredBooth } from "@/lib/types";

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
  opts?: { interestWeights?: Record<string, number> },
): Promise<RankResult | null> {
  const repo = await getRepository();
  const detail = await repo.getExhibition(exhibitionSlug);
  if (!detail) return null;

  // Recommend exhibitors only — facility areas (lounge/stage) never get ranked.
  const booths = exhibitorBooths(
    await repo.listBoothsByExhibitionId(detail.exhibition.id),
  );
  // 부스 크기로 체류 시간 주입(시간예산·소요시간에 반영). floorplan 기하 사용.
  attachDwellMinutes(exhibitionSlug, booths);
  const events = await repo.listEvents(exhibitionSlug);

  const eventsByBooth: Record<string, BoothEvent[]> = {};
  for (const e of events) (eventsByBooth[e.boothId] ??= []).push(e);

  // Crowd signal from real saved routes — normalized to 0..1. Empty at first;
  // sharpens as visitors build routes (usage → better recommendations).
  // Crowd signal from real saved routes — normalized to 0..1. 동선 제거로 소스가
  // 없어져 현재는 빈 히트맵(스텁) → crowd 0. 인기/관심 스코어로 자연 degrade.
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
    interestWeights: opts?.interestWeights,
  };

  return {
    exhibitionId: detail.exhibition.id,
    ranked: rankBooths(booths, ctx),
    booths,
    eventsByBooth,
  };
}
