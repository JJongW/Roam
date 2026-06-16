import { getRepository } from "@/lib/repositories";
import { notFound, ok, parseBody } from "@/lib/api/http";
import { ensureSession, getCurrentUser } from "@/lib/api/session";
import { routeInputSchema } from "@/lib/schemas";
import { buildPlan, rankForExhibition } from "@/lib/engine/service";
import { FLOORPLANS } from "@/lib/floorplans";

export async function POST(req: Request) {
  const parsed = await parseBody(req, routeInputSchema);
  if (!parsed.ok) return parsed.res;
  const { exhibitionSlug, preference } = parsed.data;

  const rank = await rankForExhibition(exhibitionSlug, preference);
  if (!rank) return notFound("전시를 찾을 수 없습니다");

  const repo = await getRepository();
  const session = await ensureSession(rank.exhibitionId);
  const user = await getCurrentUser();
  await repo.savePreference(session.id, preference);

  // Start the route at the venue entrance so it sweeps nearest-first.
  const start = FLOORPLANS[exhibitionSlug]?.entrance;
  const plan = buildPlan(rank, preference, start);
  const route = await repo.saveRoute(
    session.id,
    rank.exhibitionId,
    {
      boothIds: plan.boothIds,
      estimatedMinutes: plan.estimatedMinutes,
      legs: plan.legs,
      scores: plan.scores,
      currentBoothId: plan.boothIds[0],
    },
    user?.id,
  );
  await repo.recordAnalytics(session.id, rank.exhibitionId, {
    type: "route_start",
  });

  return ok({ route });
}
