import { z } from "zod";
import { fail, ok, parseBody, requireAdmin, getUserId } from "@/lib/api/http";
import { getRepository } from "@/lib/repositories";

const bodySchema = z.object({
  boothId: z.string().min(1),
  /** "verified" = 확인한 값으로 교체, "keep" = 운영 값 유지(기록만 남긴다). */
  choice: z.enum(["verified", "keep"]),
  summary: z.string().max(300).optional(),
  sourceUrl: z.string().max(500).optional(),
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
  const { boothId, choice, summary, sourceUrl } = parsed.data;

  if (choice === "keep") return ok({ applied: false });
  if (!summary?.trim()) return fail("VALIDATION", "교체할 요약이 없습니다");

  const repo = await getRepository();
  await repo.upsertBoothEnrichment(
    boothId,
    { summary, ...(sourceUrl ? { sourceUrl } : {}) },
    {
      source: "verified",
      actor: (await getUserId()) ?? null,
      reason: "대조 검수 — 사람이 직접 확인한 값으로 교체",
    },
  );
  return ok({ applied: true });
}
