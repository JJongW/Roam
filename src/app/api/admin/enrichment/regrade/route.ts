import { z } from "zod";
import { notFound, ok, parseBody, requireAdmin } from "@/lib/api/http";
import { getRepository } from "@/lib/repositories";
import { gradeCandidate } from "@/lib/enrichment/quality-gate";
import type { BoothEnrichmentPatch } from "@/lib/schemas";

const bodySchema = z.object({ exhibitionSlug: z.string().min(1) });

/**
 * 대기 중인 초안을 **다시 채점한다**. LLM은 안 부른다 — 저장된 payload를 지금
 * 게이트에 다시 태울 뿐이라 요금이 없다.
 *
 * 왜 필요한가: 게이트 규칙이 바뀌면 이미 쌓인 초안의 점수가 낡는다. SIF 50건에서
 * `value_word_in_voice`가 8건 오탐이었는데, 규칙만 고치고 재채점을 안 하면 그 8건은
 * 계속 "재조사 대상"으로 남아 불필요한 Gemini 호출을 부른다.
 */
export async function POST(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const parsed = await parseBody(req, bodySchema);
  if (!parsed.ok) return parsed.res;

  const repo = await getRepository();
  const exhibitionId = await repo.getExhibitionIdBySlug(parsed.data.exhibitionSlug);
  if (!exhibitionId) return notFound("전시를 찾을 수 없습니다");

  const [pending, booths] = await Promise.all([
    repo.listEnrichmentCandidates({ exhibitionId, status: "pending", limit: 1000 }),
    repo.listBoothsFull(exhibitionId),
  ]);
  const boothById = new Map(booths.map((b) => [b.id, b]));

  // 배치 안의 중복 판정을 다시 내려면 원래처럼 순서대로 훑어야 한다.
  const seenPhrases = new Set<string>();
  const seenActions = new Set<string>();
  let changed = 0;
  for (const c of pending) {
    const booth = boothById.get(c.boothId);
    if (!booth) continue;
    const payload = c.payload as BoothEnrichmentPatch;
    const report = gradeCandidate({
      payload,
      sources: c.sources,
      booth,
      seenPhrases,
      seenActions,
      // 초안기가 그때 요청했던 필드 = payload에 담긴 키.
      requested: Object.keys(payload),
      hadMaterial: Boolean(booth.description || booth.enrichment?.summary),
    });
    const line = payload.roamInterpretation?.trim();
    if (line) seenPhrases.add(line);
    for (const a of payload.thingsToDo ?? []) {
      const t = a.replace(/\s+/g, " ").trim();
      if (t) seenActions.add(t);
    }
    if (
      report.confidence !== c.confidence ||
      report.issues.length !== c.issues.length
    ) {
      await repo.regradeCandidate(c.id, report.confidence, report.issues);
      changed += 1;
    }
  }
  return ok({ examined: pending.length, changed });
}
