import { ok, requireAdmin, withErrorBoundary } from "@/lib/api/http";
import { getRepository } from "@/lib/repositories";

/** 브랜드 컨택 목록(0061). `?exhibitionId=`로 박람회 하나만. 행이 없는 부스는 안 나온다. */
export async function GET(req: Request) {
  return withErrorBoundary(req, async () => {
    const denied = await requireAdmin();
    if (denied) return denied;
    const exhibitionId = new URL(req.url).searchParams.get("exhibitionId") || undefined;
    const repo = await getRepository();
    return ok({ contacts: await repo.listBrandContacts({ exhibitionId }) });
  });
}
