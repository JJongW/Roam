import { getRepository } from "@/lib/repositories";
import { notFound, ok } from "@/lib/api/http";

type Ctx = { params: Promise<{ slug: string }> };

/**
 * Crowd heatmap: how often each booth and each corridor (consecutive booth
 * pair) appears across every saved route for this exhibition. The map tints
 * popular booths and thickens busy corridors so visitors can see where the
 * crowd goes. Aggregated in the DB — no LLM.
 */
export async function GET(_req: Request, { params }: Ctx) {
  const { slug } = await params;
  const repo = await getRepository();
  const detail = await repo.getExhibition(slug);
  if (!detail) return notFound("전시를 찾을 수 없습니다");
  const data = await repo.boothHeatmap(detail.exhibition.id);
  return ok(data);
}
