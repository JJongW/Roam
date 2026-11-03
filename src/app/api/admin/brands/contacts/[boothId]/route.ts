import {
  getAdminActor,
  notFound,
  ok,
  parseBody,
  requireAdmin,
  withErrorBoundary,
} from "@/lib/api/http";
import { getRepository } from "@/lib/repositories";
import { brandContactPatchSchema } from "@/lib/schemas";
import { emptyContact } from "@/lib/brands/contact";

type Ctx = { params: Promise<{ boothId: string }> };

/** 부스 하나의 컨택과 VOC 로그. 컨택 행이 없으면 저장하지 않은 빈 값을 준다. */
export async function GET(req: Request, { params }: Ctx) {
  return withErrorBoundary(req, async () => {
    const denied = await requireAdmin();
    if (denied) return denied;
    const { boothId } = await params;
    const repo = await getRepository();
    const booth = await repo.getBooth(boothId);
    if (!booth) return notFound("부스를 찾을 수 없어요");
    const [contact, logs] = await Promise.all([
      repo.getBrandContact(boothId),
      repo.listBrandContactLogs(boothId),
    ]);
    return ok({
      contact: contact ?? emptyContact(boothId, booth.exhibitionId, new Date().toISOString()),
      saved: !!contact,
      logs,
    });
  });
}

/** 보낸 칸만 바꾼다. 체크리스트는 `{ key: true|false }` 토글. */
export async function PATCH(req: Request, { params }: Ctx) {
  return withErrorBoundary(req, async () => {
    const denied = await requireAdmin();
    if (denied) return denied;
    const parsed = await parseBody(req, brandContactPatchSchema);
    if (!parsed.ok) return parsed.res;
    const { boothId } = await params;
    const repo = await getRepository();
    const contact = await repo.upsertBrandContact(boothId, parsed.data, await getAdminActor());
    if (!contact) return notFound("부스를 찾을 수 없어요");
    return ok({ contact });
  });
}
