import { z } from "zod";
import { ok, parseBody, requireAdmin } from "@/lib/api/http";
import { getRepository } from "@/lib/repositories";
import { planFromRepository } from "@/lib/exhibitor/service";

const bodySchema = z.object({ apply: z.boolean().default(false) });

/**
 * 참가사 백필 — 모든 회차의 참가 부스를 참가사(행사를 넘는 브랜드)에 잇는다.
 * apply=false면 계획 숫자만 돌려준다. 다시 돌려도 이미 배정된 부스는 건드리지
 * 않는다(설계 2026-10-02 §7).
 */
export async function POST(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const parsed = await parseBody(req, bodySchema);
  if (!parsed.ok) return parsed.res;

  const repo = await getRepository();
  const { plan, booths } = await planFromRepository(repo);
  const name = new Map(booths.map((b) => [b.id, `${b.name}(${b.code ?? "-"})`]));
  const summary = {
    newExhibitors: plan.exhibitors.length,
    newParticipants: plan.participants.length,
    assignments: plan.assignments.length,
    candidates: plan.candidates.length,
    // 여러 회차에 걸친 새 참가사 — 자동 연결이 실제로 무엇을 묶었는지 눈으로 본다.
    multiExhibition: plan.exhibitors
      .map((e) => ({
        name: e.canonicalName,
        exhibitions: new Set(
          plan.participants.filter((p) => "new" in p.exhibitorRef && p.exhibitorRef.new === e.key).map((p) => p.exhibitionId),
        ).size,
      }))
      .filter((x) => x.exhibitions > 1),
    sampleCandidates: plan.candidates.slice(0, 30).map((c) => ({ booth: name.get(c.boothId), reason: c.reason })),
  };
  if (!parsed.data.apply) return ok({ summary, applied: null });
  return ok({ summary, applied: await repo.applyExhibitorPlan(plan) });
}
