import { getRepository } from "@/lib/repositories";
import { notFound, ok } from "@/lib/api/http";
import { gateFairBySlug } from "@/lib/exhibition/open-gate";

type Ctx = { params: Promise<{ slug: string }> };

/**
 * Crowd heatmap: how often each booth and each corridor (consecutive booth
 * pair) appears across every saved route for this exhibition. The map tints
 * popular booths and thickens busy corridors so visitors can see where the
 * crowd goes. Aggregated in the DB — no LLM.
 */
export async function GET(_req: Request, { params }: Ctx) {
  const { slug } = await params;
  // 지도에 놓인 부스가 없는 박람회는 방문객에게 내주지 않는다(lib/exhibition/open-gate.ts).
  const gated = await gateFairBySlug(slug);
  if (gated) return gated;
  const repo = await getRepository();
  const detail = await repo.getExhibition(slug);
  if (!detail) return notFound("행사를 찾을 수 없어요");
  const data = await repo.boothHeatmap(detail.exhibition.id);
  return ok(data);
}
