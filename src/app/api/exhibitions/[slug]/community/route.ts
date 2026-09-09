import { getRepository } from "@/lib/repositories";
import { created, fail, ok, parseBody, notFound } from "@/lib/api/http";
import { getCurrentUser } from "@/lib/api/session";
import { communityPostInputSchema } from "@/lib/schemas";

type Ctx = { params: Promise<{ slug: string }> };

export async function GET(req: Request, { params }: Ctx) {
  const { slug } = await params;
  const { searchParams } = new URL(req.url);
  const repo = await getRepository();
  const detail = await repo.getExhibition(slug);
  if (!detail) return notFound("전시를 찾을 수 없습니다");
  const page = await repo.listPosts(detail.exhibition.id, {
    cursor: searchParams.get("cursor") ?? undefined,
    limit: searchParams.get("limit")
      ? Number(searchParams.get("limit"))
      : undefined,
  });
  // watchPosts expects the post array directly under `data`.
  return ok(page.data);
}

export async function POST(req: Request, { params }: Ctx) {
  const { slug } = await params;
  const parsed = await parseBody(req, communityPostInputSchema);
  if (!parsed.ok) return parsed.res;
  const repo = await getRepository();
  const detail = await repo.getExhibition(slug);
  if (!detail) return notFound("전시를 찾을 수 없습니다");
  const user = await getCurrentUser();
  if (!user) return fail("UNAUTHORIZED", "로그인이 필요합니다");
  const post = await repo.createPost(user.id, detail.exhibition.id, parsed.data);
  return created({ post });
}
