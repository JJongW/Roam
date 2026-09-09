import { z } from "zod";
import { fail, ok, parseBody, requireAdmin, getUserId } from "@/lib/api/http";
import { getRepository } from "@/lib/repositories";

const bodySchema = z.object({
  boothId: z.string().min(1),
  /** "verified" = 확인한 값으로 교체, "keep" = 운영 값 유지(기록만 남긴다). */
  choice: z.enum(["verified", "keep"]),
  /** 교체할 값 전부. 비어 있는 필드는 보내지 않는다 — 운영 값이 그대로 남는다. */
  patch: z.record(z.string(), z.unknown()).optional(),
});

/**
 * 대조 검수 — 운영에 있는 글과 사람이 확인한 글 중 무엇이 맞는지 고른 결과를 적용한다.
 *
 * 왜 따로 있나: 인입은 "빈 칸만 채운다"라서 이미 값이 있는 자리는 못 건드린다.
 * 그 자리를 일괄로 덮으면 멀쩡한 글까지 망가진다(실제로 싸이벡은 LLM 초안이 더
 * 정확했다). 그래서 한 건씩 사람이 고른다.
 */
export async function POST(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const parsed = await parseBody(req, bodySchema);
  if (!parsed.ok) return parsed.res;
  const { boothId, choice, patch } = parsed.data;

  if (choice === "keep") return ok({ applied: false });
  if (!patch || Object.keys(patch).length === 0) {
    return fail("VALIDATION", "교체할 값이 없습니다");
  }

  const repo = await getRepository();
  await repo.upsertBoothEnrichment(
    boothId,
    patch as Parameters<typeof repo.upsertBoothEnrichment>[1],
    {
      source: "verified",
      actor: (await getUserId()) ?? null,
      reason: "대조 검수 — 사람이 직접 확인한 값으로 교체",
    },
  );
  return ok({ applied: true });
}
