import { ok, requireAdmin } from "@/lib/api/http";
import { getRepository } from "@/lib/repositories";
import type { EnrichmentCandidate } from "@/lib/types";

/** 검수 큐. 신뢰도 높은 순 — 쉬운 것부터 치우고 어려운 것에 시간을 쓴다. */
export async function GET(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const url = new URL(req.url);
  const repo = await getRepository();
  const exhibitionSlug = url.searchParams.get("exhibitionSlug");
  const exhibitionId = exhibitionSlug
    ? ((await repo.getExhibitionIdBySlug(exhibitionSlug)) ?? undefined)
    : undefined;
  const candidates = await repo.listEnrichmentCandidates({
    exhibitionId,
    status:
      (url.searchParams.get("status") as EnrichmentCandidate["status"]) ??
      "pending",
    limit: 100,
  });
  return ok({ candidates });
}
