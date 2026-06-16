import { getRepository } from "@/lib/repositories";
import { notFound, ok, parseBody } from "@/lib/api/http";
import { routePatchSchema } from "@/lib/schemas";
import { recomputeRoute } from "@/lib/engine/route";
import { rankForExhibition } from "@/lib/engine/service";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const repo = await getRepository();
  const route = await repo.getRoute(id);
  if (!route) return notFound("경로를 찾을 수 없습니다");
  return ok({ route });
}

/**
 * Update route progress. When `deviated` + `position` are supplied (Phase 2),
 * the remaining path is recomputed from the current position.
 */
export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const parsed = await parseBody(req, routePatchSchema);
  if (!parsed.ok) return parsed.res;
  const repo = await getRepository();

  let route = await repo.getRoute(id);
  if (!route) return notFound("경로를 찾을 수 없습니다");

  const patched = await repo.patchRoute(id, parsed.data);
  if (!patched) return notFound();
  route = patched;

  // Recompute remaining route on deviation.
  if (parsed.data.deviated && parsed.data.position) {
    const pref = await repo.getPreference(route.sessionId);
    const exhibitions = await repo.listExhibitions({ limit: 200 });
    const exhibition = exhibitions.data.find((e) => e.id === route!.exhibitionId);
    if (pref && exhibition) {
      const rank = await rankForExhibition(exhibition.slug, pref);
      if (rank) {
        const replan = recomputeRoute(
          rank.ranked,
          route.visitedBoothIds,
          parsed.data.position,
          {
            movementPreference: pref.movementPreference,
            availableMinutes: pref.availableMinutes,
            waitingByBooth: rank.waitingByBooth,
          },
        );
        const refreshed = await repo.saveRoute(route.sessionId, route.exhibitionId, {
          boothIds: replan.boothIds,
          estimatedMinutes: replan.estimatedMinutes,
          legs: replan.legs,
          scores: replan.scores,
          currentBoothId: replan.boothIds.find((b) => !route!.visitedBoothIds.includes(b)),
        });
        return ok({ route: refreshed, recomputed: true });
      }
    }
  }

  if (parsed.data.status === "completed") {
    await repo.recordAnalytics(route.sessionId, route.exhibitionId, { type: "route_complete" });
  }

  return ok({ route });
}
