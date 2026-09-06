import { z } from "zod";
import { fail, notFound, ok, parseBody, requireAdmin } from "@/lib/api/http";
import { getRepository } from "@/lib/repositories";
import { extractJSON, generateGrounded, hasGemini } from "@/lib/ai/gemini";
import {
  draftSystemPrompt,
  draftUserPrompt,
  missingFields,
} from "@/lib/enrichment/draft-prompt";
import { gradeCandidate } from "@/lib/enrichment/quality-gate";
import type { BoothEnrichmentAuthorInput } from "@/lib/schemas";

/** 한 번에 도는 부스 수의 하드 상한. LLM 호출이라 실수 한 번이 요금이 된다. */
const MAX_BATCH = 30;

const bodySchema = z.object({
  exhibitionSlug: z.string().min(1),
  /** 특정 부스만. 비우면 저작 필드가 빈 부스부터 채운다. */
  codes: z.array(z.string()).optional(),
  limit: z.number().int().min(1).max(MAX_BATCH).default(10),
});

/**
 * 자동 초안(enrichment-drafter). **아무것도 운영에 반영하지 않는다** —
 * enrichment_candidate에 pending으로만 쌓고, 사람이 승인해야 booth_enrichment로
 * 간다. 로미가 하는 말은 사용자가 부스를 고르는 근거라 검수 없이 나가면 안 된다.
 *
 * 결정론 품질 게이트가 각 초안을 채점해 같이 저장한다. LLM에게 자기 글을
 * 평가시키지 않는 이유는 quality-gate.ts에 적었다.
 */
export async function POST(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  if (!hasGemini) return fail("UNPROCESSABLE", "GEMINI_API_KEY가 없어 초안을 만들 수 없습니다");

  const parsed = await parseBody(req, bodySchema);
  if (!parsed.ok) return parsed.res;
  const { exhibitionSlug, codes, limit } = parsed.data;

  const repo = await getRepository();
  const exhibitionId = await repo.getExhibitionIdBySlug(exhibitionSlug);
  if (!exhibitionId) return notFound(`전시를 찾을 수 없습니다: ${exhibitionSlug}`);

  const booths = await repo.listBoothsFull(exhibitionId);
  const wanted = codes?.length
    ? booths.filter((b) => b.code && codes.includes(b.code))
    : booths
        // 시설(라운지·센터)은 참가사가 아니라 초안 대상이 아니다.
        .filter((b) => b.kind !== "facility")
        .filter((b) => missingFields(b.enrichment).length > 0);
  const targets = wanted.slice(0, limit);

  const system = draftSystemPrompt();
  // 배치 안에서 같은 문장이 반복되는지 보려면 지금까지 나온 문장을 들고 있어야 한다.
  const seenPhrases = new Set<string>();
  const rows: Parameters<typeof repo.createEnrichmentCandidates>[0] = [];
  const failures: { code: string; message: string }[] = [];

  for (const booth of targets) {
    const missing = missingFields(booth.enrichment);
    if (missing.length === 0) continue;
    try {
      const { text, sources } = await generateGrounded({
        system,
        prompt: draftUserPrompt({
          booth,
          existing: booth.enrichment,
          missing,
        }),
      });
      const payload = extractJSON<Partial<BoothEnrichmentAuthorInput>>(text);
      // 요청하지 않은 필드는 버린다 — 이미 사람이 쓴 값을 초안이 덮을 자리를
      // 애초에 만들지 않는다.
      const kept = Object.fromEntries(
        Object.entries(payload).filter(([k]) => missing.includes(k)),
      ) as Partial<BoothEnrichmentAuthorInput>;
      const report = gradeCandidate({
        payload: kept,
        sources,
        booth,
        seenPhrases,
      });
      const line = kept.roamInterpretation?.trim();
      if (line) seenPhrases.add(line);
      rows.push({
        boothId: booth.id,
        exhibitionId,
        source: "drafter",
        payload: kept as Record<string, unknown>,
        sources,
        confidence: report.confidence,
        issues: report.issues,
      });
    } catch (e) {
      failures.push({
        code: booth.code ?? booth.id,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  await repo.createEnrichmentCandidates(rows);
  return ok({
    requested: targets.length,
    drafted: rows.length,
    failures,
    // 검수 부담을 미리 보여준다.
    byConfidence: {
      high: rows.filter((r) => r.confidence >= 0.8).length,
      mid: rows.filter((r) => r.confidence >= 0.5 && r.confidence < 0.8).length,
      low: rows.filter((r) => r.confidence < 0.5).length,
    },
  });
}
