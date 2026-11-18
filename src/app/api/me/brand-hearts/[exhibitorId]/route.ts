import { fail, noContent, notFound, ok } from "@/lib/api/http";
import { getCurrentUser } from "@/lib/api/session";
import { getRepository } from "@/lib/repositories";

type Ctx = { params: Promise<{ exhibitorId: string }> };

/** 브랜드 하트 남기기. 이미 있으면 그대로 200(여러 번 눌러도 한 줄). */
export async function PUT(_req: Request, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user) return fail("UNAUTHORIZED", "로그인이 필요해요");
  const { exhibitorId } = await params;
  const repo = await getRepository();
  const heart = await repo.addBrandHeart(user.id, exhibitorId);
  if (!heart) return notFound("브랜드를 찾을 수 없어요");
  return ok({ heart: { exhibitorId: heart.exhibitorId, heartedAt: heart.createdAt } });
}

/** 브랜드 하트 빼기. 없어도 204 — 기기에서 뺀 걸 나중에 올릴 때 실패로 보지 않게. */
export async function DELETE(_req: Request, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user) return fail("UNAUTHORIZED", "로그인이 필요해요");
  const { exhibitorId } = await params;
  const repo = await getRepository();
  await repo.removeBrandHeart(user.id, exhibitorId);
  return noContent();
}
