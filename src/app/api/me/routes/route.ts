import { getRepository } from "@/lib/repositories";
import {
  created,
  getSessionId,
  getUserId,
  ok,
  parseBody,
} from "@/lib/api/http";
import { ensureSession } from "@/lib/api/session";
import { routeSaveSchema } from "@/lib/schemas";
import { shortId } from "@/lib/utils";

/** List the caller's own saved routes (by user when signed in, else by session). */
export async function GET() {
  const userId = (await getUserId()) ?? undefined;
  const sessionId = await getSessionId();
  if (!userId && !sessionId) return ok({ data: [] });
  const repo = await getRepository();
  const data = await repo.listMyRoutes({ sessionId: sessionId ?? "", userId });
  return ok({ data });
}

/**
 * Save the current route under a name. A signed-in save also publishes the
 * route to the public gallery ("다른 사람 동선") in one step — so saving is
 * enough to share, no separate publish action needed. (Anonymous saves stay
 * private, since they have no nickname for the gallery byline.)
 */
export async function POST(req: Request) {
  const parsed = await parseBody(req, routeSaveSchema);
  if (!parsed.ok) return parsed.res;
  const { exhibitionId, title, boothIds, estimatedMinutes, legs } = parsed.data;

  const session = await ensureSession(exhibitionId);
  const userId = (await getUserId()) ?? undefined;

  const repo = await getRepository();
  const route = await repo.saveRoute(
    session.id,
    exhibitionId,
    { boothIds, estimatedMinutes, legs, scores: {} },
    userId,
    title,
  );

  if (userId) {
    const published = await repo.publishRoute(route.id, {
      title,
      isPublic: true,
      shareId: shortId(),
      userId,
    });
    if (published) return created({ route: published });
  }
  return created({ route });
}
