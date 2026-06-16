import { notFound, ok, parseBody } from "@/lib/api/http";
import { recommendationInputSchema } from "@/lib/schemas";
import { rankForExhibition } from "@/lib/engine/service";

export async function POST(req: Request) {
  const parsed = await parseBody(req, recommendationInputSchema);
  if (!parsed.ok) return parsed.res;
  const { exhibitionSlug, preference } = parsed.data;
  const rank = await rankForExhibition(exhibitionSlug, preference);
  if (!rank) return notFound("전시를 찾을 수 없습니다");
  return ok({ ranked: rank.ranked });
}
