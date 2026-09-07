import { z } from "zod";
import { getUserId, notFound, ok, parseBody, requireAdmin } from "@/lib/api/http";
import { getRepository } from "@/lib/repositories";
import { boothEnrichmentPatchSchema } from "@/lib/schemas";

type Ctx = { params: Promise<{ id: string }> };

/** 자주 쓰는 반려 사유. 자유 텍스트만 두면 아무도 안 적고, 안 적히면 학습이 없다. */
export const REJECT_REASONS = {
  wrong_fact: "사실이 틀렸다",
  no_evidence: "근거 없이 지어냈다",
  voice: "로미 말투가 아니다",
  vague: "두루뭉술하다 — 이 부스 얘기가 아니다",
  duplicate: "다른 부스와 같은 말이다",
} as const;

const bodySchema = z.object({
  action: z.enum(["approve", "reject"]),
  /** 반려 사유 코드. 위 목록 중 하나. */
  reasonCode: z.enum(
    Object.keys(REJECT_REASONS) as [keyof typeof REJECT_REASONS],
  ).optional(),
  /** 덧붙이는 설명. 다음 초안 프롬프트에 그대로 들어간다. */
  note: z.string().max(400).optional(),
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
    // 사유가 이 반려의 전부다. 없으면 "별로였다"는 한 비트만 남고, 다음 초안이
    // 똑같은 걸 또 만들어 온다.
    const note = [
      parsed.data.reasonCode ? REJECT_REASONS[parsed.data.reasonCode] : "",
      parsed.data.note?.trim() ?? "",
    ]
      .filter(Boolean)
      .join(" — ");
    await repo.setCandidateStatus(id, "rejected", actor, note || null);
    // 원장에도 남긴다. 필드가 안 바뀌므로 상태 전이를 diff로 적는다.
    await repo.recordChange({
      entity: "enrichment_candidate",
      entityId: id,
      scopeId: candidate.boothId,
      source: "admin",
      actor,
      reason: note || null,
      fieldDiffs: { status: { before: "pending", after: "rejected" } },
    });
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
  await repo.setCandidateStatus(id, "approved", actor, parsed.data.note ?? null);
  return ok({ applied: true });
}
