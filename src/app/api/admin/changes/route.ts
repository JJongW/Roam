import { ok, requireAdmin } from "@/lib/api/http";
import { getRepository } from "@/lib/repositories";

/**
 * 변경 이력 조회. entity·entityId·scopeId로 좁힌다.
 *
 * 엔티티를 쿼리 파라미터로 받는 건 의도다 — 지금은 booth_enrichment만 쌓이지만
 * 부스 본체·전시·이벤트·LLM 초안이 같은 원장에 들어온다. 엔티티마다 엔드포인트를
 * 만들면 그때마다 라우트가 늘어난다.
 */
export async function GET(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const url = new URL(req.url);
  const num = Number(url.searchParams.get("limit"));
  const repo = await getRepository();
  const changes = await repo.listChanges({
    entity: url.searchParams.get("entity") ?? undefined,
    entityId: url.searchParams.get("entityId") ?? undefined,
    scopeId: url.searchParams.get("scopeId") ?? undefined,
    limit: Number.isFinite(num) && num > 0 ? Math.min(num, 500) : 100,
  });
  return ok({ changes });
}
