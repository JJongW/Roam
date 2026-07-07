import { getRepository } from "@/lib/repositories";
import {
  getSessionId,
  getUserId,
  noContent,
  notFound,
  ok,
  parseBody,
} from "@/lib/api/http";
import { routePatchSchema } from "@/lib/schemas";
import { recomputeRoute } from "@/lib/engine/route";
import { rankForExhibition } from "@/lib/engine/service";
import { assessFatigue } from "@/lib/engine/reasoner";
import { replanRemaining } from "@/lib/engine/planner";
import { FLOORPLANS } from "@/lib/floorplans";
import { reflectOnVisit } from "@/lib/memory/service";

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
    const exhibition = exhibitions.data.find(
      (e) => e.id === route!.exhibitionId,
    );
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
          },
        );
        const refreshed = await repo.saveRoute(
          route.sessionId,
          route.exhibitionId,
          {
            boothIds: replan.boothIds,
            estimatedMinutes: replan.estimatedMinutes,
            legs: replan.legs,
            scores: replan.scores,
            currentBoothId: replan.boothIds.find(
              (b) => !route!.visitedBoothIds.includes(b),
            ),
          },
        );
        return ok({ route: refreshed, recomputed: true });
      }
    }
  }

  // Planner: 실경과 시간이 오면 남은 시간·피로로 남은 동선을 재계획한다.
  if (parsed.data.elapsedMinutes != null) {
    const pref = await repo.getPreference(route.sessionId);
    const exhibitions = await repo.listExhibitions({ limit: 200 });
    const exhibition = exhibitions.data.find(
      (e) => e.id === route!.exhibitionId,
    );
    if (pref && exhibition) {
      const rank = await rankForExhibition(exhibition.slug, pref);
      if (rank) {
        const current = parsed.data.position ??
          FLOORPLANS[exhibition.slug]?.entrance ?? { x: 0, y: 0 };
        const fatigue = assessFatigue({
          boothsVisited: route.visitedBoothIds.length,
          plannedStops: route.boothIds.length,
          elapsedMinutes: parsed.data.elapsedMinutes,
          budgetMinutes: pref.availableMinutes,
        });
        const replan = replanRemaining({
          ranked: rank.ranked,
          visitedBoothIds: route.visitedBoothIds,
          current,
          movementPreference: pref.movementPreference,
          budgetMinutes: pref.availableMinutes,
          elapsedMinutes: parsed.data.elapsedMinutes,
          fatigue,
        });
        const refreshed = await repo.saveRoute(
          route.sessionId,
          route.exhibitionId,
          {
            boothIds: replan.boothIds,
            estimatedMinutes: replan.estimatedMinutes,
            legs: replan.legs,
            scores: replan.scores,
            currentBoothId: replan.boothIds.find(
              (b) => !route!.visitedBoothIds.includes(b),
            ),
          },
        );
        return ok({ route: refreshed, replanned: true, fatigue });
      }
    }
  }

  if (parsed.data.status === "completed") {
    await repo.recordAnalytics(route.sessionId, route.exhibitionId, {
      type: "route_complete",
    });
    // L4 회고: 로그인 사용자의 완료 관람을 VisitDigest로 증류(L3→L4).
    if (route.userId) await reflectOnVisit(route.userId, route);
  }

  return ok({ route });
}

/** Delete a saved route the caller owns. */
export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const userId = (await getUserId()) ?? undefined;
  const sessionId = (await getSessionId()) ?? "";
  const repo = await getRepository();
  const deleted = await repo.deleteRoute(id, { sessionId, userId });
  if (!deleted) return notFound("경로를 찾을 수 없습니다");
  return noContent();
}
