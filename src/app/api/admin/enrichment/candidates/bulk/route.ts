import { z } from "zod";
import { getUserId, ok, parseBody, requireAdmin } from "@/lib/api/http";
import { getRepository } from "@/lib/repositories";
import { reviewPolicy } from "@/lib/enrichment/review-policy";
import type { BoothEnrichmentPatch } from "@/lib/schemas";

const bodySchema = z.object({
  exhibitionSlug: z.string().min(1),
  /** 안전장치 — 화면이 보여준 건수와 서버가 세는 건수가 다르면 멈춘다. */
  expected: z.number().int().min(1),
});

/**
 * 자동 통과 대상 일괄 반영. 900부스짜리 전시에서 **실제로 일을 줄이는 건 이것**이다.
 *
 * 정책 판정은 서버가 다시 한다 — 화면이 보낸 목록을 그대로 믿으면 오래된 화면이
 * 지금은 통과 대상이 아닌 걸 밀어 넣을 수 있다. `expected`가 안 맞으면 멈추는
 * 것도 같은 이유다(사이에 다른 사람이 검수했을 수 있다).
 */
export async function POST(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const parsed = await parseBody(req, bodySchema);
  if (!parsed.ok) return parsed.res;

  const repo = await getRepository();
  const exhibitionId = await repo.getExhibitionIdBySlug(parsed.data.exhibitionSlug);
  if (!exhibitionId) return ok({ applied: 0, note: "전시를 찾을 수 없습니다" });

  const pending = await repo.listEnrichmentCandidates({
    exhibitionId,
    status: "pending",
    limit: 1000,
  });
  const targets = pending.filter(
    (c) => reviewPolicy(c.confidence, c.issues).wouldAutoPass,
  );
  if (targets.length !== parsed.data.expected) {
    return ok({
      applied: 0,
      note: `화면은 ${parsed.data.expected}건인데 지금은 ${targets.length}건입니다 — 새로고침 후 다시 확인해주세요.`,
    });
  }

  const actor = await getUserId();
  let applied = 0;
  const failures: { boothId: string; message: string }[] = [];
  for (const c of targets) {
    try {
      await repo.upsertBoothEnrichment(
        c.boothId,
        c.payload as BoothEnrichmentPatch,
        {
          source: "drafter",
          actor,
          // 개별 승인과 구분해 남긴다 — 나중에 "일괄로 나간 것"만 되짚을 수 있어야 한다.
          reason: `일괄 반영(자동 통과 대상, 신뢰도 ${c.confidence.toFixed(2)})`,
        },
      );
      await repo.setCandidateStatus(c.id, "approved", actor, "일괄 반영");
      applied += 1;
    } catch (e) {
      failures.push({
        boothId: c.boothId,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }
  return ok({ applied, failures });
}
