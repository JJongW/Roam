import { z } from "zod";
import { created, getAdminActor, notFound, ok, parseBody, requireAdmin, withErrorBoundary } from "@/lib/api/http";
import { getRepository } from "@/lib/repositories";
import { enqueueExhibitionDrafts } from "@/lib/brands/jobs";

const bodySchema = z.object({
  exhibitionId: z.string().min(1),
  /** false면 이미 다 채운 브랜드도 넣는다(워커는 사람이 확인한 칸을 어차피 건드리지 않는다). */
  onlyNeeded: z.boolean().optional(),
});

/**
 * "이 박람회 브랜드 초안 만들기" — 박람회 하나의 브랜드에 초안 잡을 넣는다(2026-11-03 Ted
 * 결정: 첫 실행은 박람회 단위로). 잡 하나에 20곳, 대기 중인 브랜드는 다시 넣지 않는다.
 */
export async function POST(req: Request) {
  return withErrorBoundary(req, async () => {
    const denied = await requireAdmin();
    if (denied) return denied;
    const parsed = await parseBody(req, bodySchema);
    if (!parsed.ok) return parsed.res;
    const repo = await getRepository();
    const exhibitions = (await repo.listExhibitions({ limit: 500 })).data;
    if (!exhibitions.some((e) => e.id === parsed.data.exhibitionId)) return notFound("박람회를 찾을 수 없어요");
    const r = await enqueueExhibitionDrafts(repo, parsed.data.exhibitionId, {
      actor: await getAdminActor(),
      onlyNeeded: parsed.data.onlyNeeded,
    });
    return r.brands > 0 ? created(r) : ok(r);
  });
}
