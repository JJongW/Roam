import { z } from "zod";
import { getRepository } from "@/lib/repositories";
import { fail, ok } from "@/lib/api/http";
import { getCurrentUser } from "@/lib/api/session";

const querySchema = z.object({
  exhibitionSlug: z.string().min(1),
  limit: z.coerce.number().int().min(1).max(10).default(5),
});

// 관람 마치기 두 번째 되묻기 묶음 — '꼭 갈래'로 찍어뒀는데 아직 안 간(visitedAt
// 없는) 부스에 "여기 가봤어?"로 단정 없이 묻는다(judgment-vocabulary §7-2).
// 무반응은 "못 갔다"로 기록하지 않는다 — 채점에서 빠질 뿐이다.
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return fail("UNAUTHORIZED", "로그인이 필요해요");

  const url = new URL(req.url);
  const parsed = querySchema.safeParse({
    exhibitionSlug: url.searchParams.get("exhibitionSlug"),
    limit: url.searchParams.get("limit") ?? undefined,
  });
  if (!parsed.success) return fail("VALIDATION", "입력값을 확인해 주세요");

  const repo = await getRepository();
  const detail = await repo.getExhibition(parsed.data.exhibitionSlug);
  if (!detail) return fail("NOT_FOUND", "전시를 찾을 수 없어요");

  const pending = await repo.listMustNotVisited(
    user.id,
    detail.exhibition.id,
    parsed.data.limit,
  );
  return ok({ pending });
}
