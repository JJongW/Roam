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
  const status =
    (url.searchParams.get("status") as EnrichmentCandidate["status"]) ??
    "pending";
  const candidates = await repo.listEnrichmentCandidates({
    exhibitionId,
    status,
    limit: 100,
  });

  // 차수(1차·2차·3차…)는 저장하지 않고 **생성 순서에서 도출한다** — 컬럼을
  // 하나 더 두면 초안을 만드는 곳마다 맞춰 써야 하고, 안 맞으면 조용히 틀린다.
  // 같은 부스의 후보를 만든 시각 순으로 세면 그게 곧 차수다.
  const rounds = new Map<string, number>();
  if (exhibitionId) {
    const all = await repo.listEnrichmentCandidates({ exhibitionId, limit: 1000 });
    const byBooth = new Map<string, EnrichmentCandidate[]>();
    for (const c of all) {
      const list = byBooth.get(c.boothId) ?? [];
      list.push(c);
      byBooth.set(c.boothId, list);
    }
    for (const list of byBooth.values()) {
      list.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      list.forEach((c, i) => rounds.set(c.id, i + 1));
    }
  }

  return ok({
    candidates: candidates.map((c) => ({ ...c, round: rounds.get(c.id) ?? 1 })),
  });
}
