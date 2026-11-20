import { getRepository } from "@/lib/repositories";
import { ok } from "@/lib/api/http";
import { gateFairBySlug } from "@/lib/exhibition/open-gate";

type Ctx = { params: Promise<{ slug: string }> };

export async function GET(req: Request, { params }: Ctx) {
  const { slug } = await params;
  // 지도에 놓인 부스가 없는 박람회는 방문객에게 내주지 않는다(lib/exhibition/open-gate.ts).
  const gated = await gateFairBySlug(slug);
  if (gated) return gated;
  const { searchParams } = new URL(req.url);
  const repo = await getRepository();
  const data = await repo.listEvents(slug, {
    boothId: searchParams.get("boothId") ?? undefined,
    from: searchParams.get("from") ?? undefined,
    to: searchParams.get("to") ?? undefined,
  });
  return ok({ data });
}
