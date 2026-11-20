import { getRepository } from "@/lib/repositories";
import { ok } from "@/lib/api/http";
import { withBrandIds } from "@/lib/booth/brand-ids";
import { gateFairBySlug } from "@/lib/exhibition/open-gate";

type Ctx = { params: Promise<{ slug: string }> };

export async function GET(req: Request, { params }: Ctx) {
  const { slug } = await params;
  // 지도에 놓인 부스가 없는 박람회는 방문객에게 내주지 않는다(lib/exhibition/open-gate.ts).
  const gated = await gateFairBySlug(slug);
  if (gated) return gated;
  const { searchParams } = new URL(req.url);
  const repo = await getRepository();
  const page = await repo.listBooths(slug, {
    hallId: searchParams.get("hallId") ?? undefined,
    categoryId: searchParams.get("categoryId") ?? undefined,
    q: searchParams.get("q") ?? undefined,
    cursor: searchParams.get("cursor") ?? undefined,
    limit: Number(searchParams.get("limit")) || undefined,
  });
  // 대표 브랜드 id(exhibitorId, participantId)를 붙인다 — 이번 페이지 부스만.
  return ok({ ...page, data: await withBrandIds(repo, page.data) });
}
