import { getRepository } from "@/lib/repositories";
import {
  noContent,
  notFound,
  ok,
  parseBody,
  requireAdmin,
} from "@/lib/api/http";
import { boothPatchInputSchema } from "@/lib/schemas";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const repo = await getRepository();
  const detail = await repo.getBoothDetail(id);
  if (!detail) return notFound("부스를 찾을 수 없습니다");
  return ok(detail);
}

// PATCH·DELETE는 관리자 콘솔(booth-manager.tsx)만 부른다 — 서버측 인가가 아예
// 없었다(전에는 booth 테이블 RLS가 우연히 막아줬을 뿐이라 보안이 아니었다). 이제
// 쓰기 자체는 서비스 롤로 RLS를 건너뛰므로(repository.ts) 여기 인가가 유일한 방어선.
export async function PATCH(req: Request, { params }: Ctx) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await params;
  const parsed = await parseBody(req, boothPatchInputSchema);
  if (!parsed.ok) return parsed.res;
  const { enrichment, ...boothFields } = parsed.data;
  const repo = await getRepository();
  if (enrichment) await repo.upsertBoothEnrichment(id, enrichment);
  const updated = await repo.updateBooth(id, boothFields);
  if (!updated) return notFound();
  return ok({ booth: updated });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await params;
  const repo = await getRepository();
  const okDel = await repo.deleteBooth(id);
  if (!okDel) return notFound();
  return noContent();
}
