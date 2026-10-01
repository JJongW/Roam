import { getRepository } from "@/lib/repositories";
import { created, fail, notFound, ok, parseBody } from "@/lib/api/http";
import { getCurrentUser } from "@/lib/api/session";
import { communityPostInputSchema } from "@/lib/schemas";

type Ctx = { params: Promise<{ id: string }> };

/** Crowd-sourced info for a single booth. 조회는 공개, 작성은 로그인(0056). */
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
  const user = await getCurrentUser();
  if (!user) return fail("UNAUTHORIZED", "로그인이 필요합니다");
  const post = await repo.createPost(user.id, booth.booth.exhibitionId, {
    ...parsed.data,
    boothId: id,
  });
  return created({ post });
}
