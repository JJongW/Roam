import { fail, ok, parseBody } from "@/lib/api/http";
import { getCurrentUser } from "@/lib/api/session";
import { getRepository } from "@/lib/repositories";
import { brandHeartSyncSchema } from "@/lib/schemas";
import { brandHeartViews } from "@/lib/brands/hearts";

/** 내 브랜드 하트. 브랜드 이름과 다가오는 참가(부스 없는 참가 포함)를 붙인다. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return fail("UNAUTHORIZED", "로그인이 필요해요");
  const repo = await getRepository();
  return ok({ data: await brandHeartViews(repo, user.id) });
}

/**
 * 로그인 직후, 기기에 먼저 남긴 브랜드 하트를 한 번에 올린다(부스 노트와 같은 길).
 * 합집합이다 — 서버에만 있는 하트를 빼지 않는다. 없는 브랜드 id는 건너뛰고 알려 준다.
 */
export async function PUT(req: Request) {
  const user = await getCurrentUser();
  if (!user) return fail("UNAUTHORIZED", "로그인이 필요해요");
  const parsed = await parseBody(req, brandHeartSyncSchema);
  if (!parsed.ok) return parsed.res;
  const repo = await getRepository();
  const unknown: string[] = [];
  for (const id of new Set(parsed.data.exhibitorIds)) {
    if (!(await repo.addBrandHeart(user.id, id))) unknown.push(id);
  }
  return ok({ data: await brandHeartViews(repo, user.id), unknown });
}
