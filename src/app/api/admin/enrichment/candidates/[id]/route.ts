import { z } from "zod";
import { getUserId, notFound, ok, parseBody, requireAdmin } from "@/lib/api/http";
import { getRepository } from "@/lib/repositories";
import { boothEnrichmentPatchSchema } from "@/lib/schemas";

type Ctx = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  action: z.enum(["approve", "reject"]),
  /** 검수자가 고친 최종본. 없으면 초안 그대로 반영한다. */
  edited: boothEnrichmentPatchSchema.optional(),
});

/**
 * 검수 결과. 승인이면 기존 `upsertBoothEnrichment`로 반영한다 — 그래야
 * change_log(0049)에 **사람이 초안을 무엇으로 고쳤는지**가 남고, 그게 루프 A의
 * 연료가 된다. 초안 자체가 아니라 그 차이가 학습 재료다.
 */
export async function POST(req: Request, { params }: Ctx) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await params;
  const parsed = await parseBody(req, bodySchema);
  if (!parsed.ok) return parsed.res;

  const repo = await getRepository();
  const candidate = await repo.getEnrichmentCandidate(id);
  if (!candidate) return notFound("초안을 찾을 수 없습니다");
  if (candidate.status !== "pending") {
    return ok({ candidate, applied: false, note: "이미 처리된 초안입니다" });
  }

  const actor = await getUserId();
  if (parsed.data.action === "reject") {
    await repo.setCandidateStatus(id, "rejected", actor);
    return ok({ applied: false });
  }

  const payload = parsed.data.edited ?? candidate.payload;
  await repo.upsertBoothEnrichment(
    candidate.boothId,
    payload as Parameters<typeof repo.upsertBoothEnrichment>[1],
    {
      source: "drafter",
      actor,
      reason: parsed.data.edited ? "초안 수정 후 승인" : "초안 그대로 승인",
    },
  );
  await repo.setCandidateStatus(id, "approved", actor);
  return ok({ applied: true });
}
