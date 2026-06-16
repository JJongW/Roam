import { getRepository } from "@/lib/repositories";
import { noContent, notFound, ok, parseBody } from "@/lib/api/http";
import { exhibitionInputSchema } from "@/lib/schemas";

type Ctx = { params: Promise<{ slug: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { slug } = await params;
  const repo = await getRepository();
  const detail = await repo.getExhibition(slug);
  if (!detail) return notFound("전시를 찾을 수 없습니다");
  return ok(detail);
}

// PATCH/DELETE treat the param as the exhibition id (admin).
export async function PATCH(req: Request, { params }: Ctx) {
  const { slug: id } = await params;
  const parsed = await parseBody(req, exhibitionInputSchema.partial());
  if (!parsed.ok) return parsed.res;
  const repo = await getRepository();
  const updated = await repo.updateExhibition(id, parsed.data);
  if (!updated) return notFound();
  return ok({ exhibition: updated });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { slug: id } = await params;
  const repo = await getRepository();
  const okDel = await repo.deleteExhibition(id);
  if (!okDel) return notFound();
  return noContent();
}
