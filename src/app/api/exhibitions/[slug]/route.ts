import { getRepository } from "@/lib/repositories";
import { noContent, notFound, ok, parseBody, requireAdmin } from "@/lib/api/http";
import { exhibitionPatchInputSchema } from "@/lib/schemas";
import { isAdminAuthed } from "@/lib/api/http";
import { isExhibitionOpenCached, notOpen } from "@/lib/exhibition/open-gate";
import { openFields } from "@/lib/exhibition/openable";

type Ctx = { params: Promise<{ slug: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { slug } = await params;
  const repo = await getRepository();
  const detail = await repo.getExhibition(slug);
  if (!detail) return notFound("행사를 찾을 수 없어요");
  // 지도에 놓인 부스가 없으면 방문객에겐 상세를 내주지 않는다(lib/exhibition/open-gate.ts).
  // 일부만 비운 상세를 주면 옛 앱이 빈 지도를 그린다. 운영자는 그대로 받는다.
  const open = await isExhibitionOpenCached(detail.exhibition.id);
  if (!open && !(await isAdminAuthed())) return notOpen();
  return ok({ ...detail, ...openFields(open) });
}

// PATCH/DELETE treat the param as the exhibition id (admin).
export async function PATCH(req: Request, { params }: Ctx) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { slug: id } = await params;
  const parsed = await parseBody(req, exhibitionPatchInputSchema);
  if (!parsed.ok) return parsed.res;
  const repo = await getRepository();
  const updated = await repo.updateExhibition(id, parsed.data);
  if (!updated) return notFound();
  return ok({ exhibition: updated });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { slug: id } = await params;
  const repo = await getRepository();
  const okDel = await repo.deleteExhibition(id);
  if (!okDel) return notFound();
  return noContent();
}
