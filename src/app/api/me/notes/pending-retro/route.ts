import { z } from "zod";
import { getRepository } from "@/lib/repositories";
import { fail, ok } from "@/lib/api/http";
import { getCurrentUser } from "@/lib/api/session";

const querySchema = z.object({
  exhibitionSlug: z.string().min(1),
  limit: z.coerce.number().int().min(1).max(10).default(5),
});

// 관람 마치기에서 쓴다 — '가봄'인데 아직 "여기 어땠어?"에 답 안 한 부스를 몇 개만
// 묶어 한 번에 되묻는다(부스가 많은 전시에서 하나씩 되묻는 건 현실적이지 않다).
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

  const pending = await repo.listPendingRetro(
    user.id,
    detail.exhibition.id,
    parsed.data.limit,
  );
  return ok({ pending });
}
