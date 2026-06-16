import { getRepository } from "@/lib/repositories";
import { created, notFound, ok, parseBody } from "@/lib/api/http";
import { ensureSession } from "@/lib/api/session";
import { communityPostInputSchema } from "@/lib/schemas";

type Ctx = { params: Promise<{ id: string }> };

/** Crowd-sourced info for a single booth (anonymous posting allowed). */
export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const repo = await getRepository();
  const booth = await repo.getBoothDetail(id);
  if (!booth) return notFound("부스를 찾을 수 없습니다");
  const all = await repo.listPosts(booth.booth.exhibitionId, { limit: 200 });
  const data = all.data.filter((p) => p.boothId === id);
  return ok({ data });
}

export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  const parsed = await parseBody(req, communityPostInputSchema);
  if (!parsed.ok) return parsed.res;
  const repo = await getRepository();
  const booth = await repo.getBoothDetail(id);
  if (!booth) return notFound("부스를 찾을 수 없습니다");
  const session = await ensureSession(booth.booth.exhibitionId);
  const post = await repo.createPost(session.id, booth.booth.exhibitionId, {
    ...parsed.data,
    boothId: id,
  });
  return created({ post });
}
