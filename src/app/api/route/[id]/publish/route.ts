import { getRepository } from "@/lib/repositories";
import { fail, notFound, ok, parseBody } from "@/lib/api/http";
import { getCurrentUser } from "@/lib/api/session";
import { routePublishSchema } from "@/lib/schemas";
import { shortId } from "@/lib/utils";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user) return fail("UNAUTHORIZED", "로그인이 필요해요");
  const { id } = await params;
  const parsed = await parseBody(req, routePublishSchema);
  if (!parsed.ok) return parsed.res;

  const repo = await getRepository();
  const route = await repo.getRoute(id);
  if (!route) return notFound("경로를 찾을 수 없습니다");
  // Only the owner (or an unclaimed route) may publish.
  if (route.userId && route.userId !== user.id)
    return fail("FORBIDDEN", "본인의 동선만 공유할 수 있어요");

  const published = await repo.publishRoute(id, {
    ...parsed.data,
    shareId: shortId(),
    userId: user.id,
  });
  if (!published) return notFound();
  return ok({ route: published });
}
