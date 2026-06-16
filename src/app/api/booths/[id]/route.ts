import { getRepository } from "@/lib/repositories";
import { noContent, notFound, ok, parseBody } from "@/lib/api/http";
import { boothInputSchema } from "@/lib/schemas";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const repo = await getRepository();
  const detail = await repo.getBoothDetail(id);
  if (!detail) return notFound("부스를 찾을 수 없습니다");
  return ok(detail);
}

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const parsed = await parseBody(req, boothInputSchema.partial());
  if (!parsed.ok) return parsed.res;
  const repo = await getRepository();
  const updated = await repo.updateBooth(id, parsed.data);
  if (!updated) return notFound();
  return ok({ booth: updated });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const repo = await getRepository();
  const okDel = await repo.deleteBooth(id);
  if (!okDel) return notFound();
  return noContent();
}
