import { getRepository } from "@/lib/repositories";
import { notFound, ok } from "@/lib/api/http";

type Ctx = { params: Promise<{ slug: string }> };

/** Public gallery: routes other visitors have shared for this exhibition. */
export async function GET(_req: Request, { params }: Ctx) {
  const { slug } = await params;
  const repo = await getRepository();
  const detail = await repo.getExhibition(slug);
  if (!detail) return notFound("전시를 찾을 수 없습니다");
  const data = await repo.listPublicRoutes(detail.exhibition.id);
  return ok({ data });
}
