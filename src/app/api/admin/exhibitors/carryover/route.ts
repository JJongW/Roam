import { z } from "zod";
import { getUserId, notFound, ok, parseBody, requireAdmin } from "@/lib/api/http";
import { getRepository } from "@/lib/repositories";
import { runCarryover } from "@/lib/exhibitor/service";

const bodySchema = z.object({ exhibitionSlug: z.string().min(1), apply: z.boolean().default(false) });

/** 이미 아는 브랜드의 지난 회차 정보를 이번 회차 초안으로 넘긴다. apply=false면 목록만. */
export async function POST(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const parsed = await parseBody(req, bodySchema);
  if (!parsed.ok) return parsed.res;
  const repo = await getRepository();
  const exhibitionId = await repo.getExhibitionIdBySlug(parsed.data.exhibitionSlug);
  if (!exhibitionId) return notFound("전시를 찾을 수 없습니다");
  const { items, autoPassed } = await runCarryover(repo, exhibitionId, {
    apply: parsed.data.apply,
    actor: await getUserId(),
  });
  return ok({
    count: items.length,
    autoPassed,
    items: items.map((i) => ({ boothId: i.boothId, from: i.sourceLabel, fields: Object.keys(i.payload), media: Object.keys(i.boothPatch) })),
  });
}
