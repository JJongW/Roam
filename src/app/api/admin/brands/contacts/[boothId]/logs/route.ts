import {
  created,
  getAdminActor,
  notFound,
  parseBody,
  requireAdmin,
  withErrorBoundary,
} from "@/lib/api/http";
import { getRepository } from "@/lib/repositories";
import { brandContactLogInputSchema } from "@/lib/schemas";

type Ctx = { params: Promise<{ boothId: string }> };

/** VOC 한 줄 추가. 고치거나 지우는 API는 두지 않는다 — 기록은 쌓기만 한다. */
export async function POST(req: Request, { params }: Ctx) {
  return withErrorBoundary(req, async () => {
    const denied = await requireAdmin();
    if (denied) return denied;
    const parsed = await parseBody(req, brandContactLogInputSchema);
    if (!parsed.ok) return parsed.res;
    const { boothId } = await params;
    const repo = await getRepository();
    const log = await repo.addBrandContactLog(boothId, parsed.data, await getAdminActor());
    if (!log) return notFound("부스를 찾을 수 없어요");
    return created({ log });
  });
}
