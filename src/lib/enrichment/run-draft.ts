import { extractJSON, generateGrounded } from "@/lib/ai/gemini";
import {
  draftSystemPrompt,
  draftUserPrompt,
  missingFields,
} from "@/lib/enrichment/draft-prompt";
import { gradeCandidate } from "@/lib/enrichment/quality-gate";
import { exhibitionLessons, rejectionsByBooth } from "@/lib/enrichment/lessons";
import type { Repository } from "@/lib/repositories/types";
import type { BoothEnrichmentPatch } from "@/lib/schemas";

export interface DraftRunInput {
  exhibitionSlug: string;
  codes?: string[];
  limit: number;
  actor?: string | null;
  /** 오래 도는 실행이 살아 있는지 보이게 한다. 워커가 잡 progress로 연결한다. */
  onProgress?: (p: { done: number; total: number; code: string }) => Promise<void>;
}

export interface DraftRunResult {
  requested: number;
  drafted: number;
  failures: { code: string; message: string }[];
  learnedFrom: { exhibitionLessons: string[]; boothsWithPriorRejections: number };
  byConfidence: { high: number; mid: number; low: number };
}

/**
 * 초안 한 배치. **라우트와 워커가 같은 함수를 쓴다** — 실행 위치가 달라도 규칙이
 * 갈리면 안 된다. 작은 배치는 admin이 바로 부르고, 큰 배치는 워커가 큐에서 집는다.
 */
export async function runDraftBatch(
  repo: Repository,
  input: DraftRunInput,
): Promise<DraftRunResult | { error: string }> {
  const exhibitionId = await repo.getExhibitionIdBySlug(input.exhibitionSlug);
  if (!exhibitionId) {
    return { error: `전시를 찾을 수 없습니다: ${input.exhibitionSlug}` };
  }

  const booths = await repo.listBoothsFull(exhibitionId);
  const wanted = input.codes?.length
    ? booths.filter((b) => b.code && input.codes!.includes(b.code))
    : booths
        // 시설(라운지·센터)은 참가사가 아니라 초안 대상이 아니다.
        .filter((b) => b.kind !== "facility")
        .filter((b) => missingFields(b.enrichment).length > 0);
  const targets = wanted.slice(0, input.limit);

  // 루프 A — 지난 반려 사유를 읽어 이번 초안에 넣는다.
  const rejected = await repo.listEnrichmentCandidates({
    exhibitionId,
    status: "rejected",
    limit: 200,
  });
  const priorByBooth = rejectionsByBooth(rejected);
  const lessons = exhibitionLessons(rejected);
  const system = draftSystemPrompt(lessons);

  const seenPhrases = new Set<string>();
  const seenActions = new Set<string>();
  const rows: Parameters<typeof repo.createEnrichmentCandidates>[0] = [];
  const failures: { code: string; message: string }[] = [];

  let done = 0;
  for (const booth of targets) {
    const missing = missingFields(booth.enrichment);
    done += 1;
    if (missing.length === 0) continue;
    try {
      const userPrompt = draftUserPrompt({
        booth,
        existing: booth.enrichment,
        missing,
        priorRejections: priorByBooth.get(booth.id),
      });
      // generateGrounded는 tools를 쓰느라 JSON 모드를 못 건다 — 산문만 돌려주는
      // 경우가 실제로 있다(파일럿에서 5건 중 1건). 한 번은 더 조여서 물어본다.
      let payload: BoothEnrichmentPatch | null = null;
      let sources: { uri: string; title?: string }[] = [];
      for (const attempt of [
        userPrompt,
        `${userPrompt}\n\n반드시 JSON 객체 하나만 출력한다. 다른 텍스트를 쓰지 않는다.`,
      ]) {
        const res = await generateGrounded({ system, prompt: attempt });
        sources = res.sources;
        try {
          payload = extractJSON<BoothEnrichmentPatch>(res.text);
          break;
        } catch {
          payload = null;
        }
      }
      if (!payload) throw new Error("JSON을 못 얻었다(재시도 후에도)");

      // 요청하지 않은 필드는 버린다 — 사람이 쓴 값을 초안이 덮을 자리를 안 만든다.
      const kept = Object.fromEntries(
        Object.entries(payload).filter(([k]) => missing.includes(k)),
      ) as BoothEnrichmentPatch;
      const report = gradeCandidate({
        payload: kept,
        sources,
        booth,
        seenPhrases,
        seenActions,
        requested: missing,
        hadMaterial: Boolean(booth.description || booth.enrichment?.summary),
      });
      const line = kept.roamInterpretation?.trim();
      if (line) seenPhrases.add(line);
      for (const a of kept.thingsToDo ?? []) {
        const t = a.replace(/\s+/g, " ").trim();
        if (t) seenActions.add(t);
      }
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
    await input.onProgress?.({
      done,
      total: targets.length,
      code: booth.code ?? booth.id,
    });
  }

  await repo.supersedePendingCandidates(rows.map((r) => r.boothId));
  await repo.createEnrichmentCandidates(rows);

  return {
    requested: targets.length,
    drafted: rows.length,
    failures,
    learnedFrom: {
      exhibitionLessons: lessons,
      boothsWithPriorRejections: [...priorByBooth.keys()].filter((id) =>
        targets.some((t) => t.id === id),
      ).length,
    },
    byConfidence: {
      high: rows.filter((r) => r.confidence >= 0.8).length,
      mid: rows.filter((r) => r.confidence >= 0.5 && r.confidence < 0.8).length,
      low: rows.filter((r) => r.confidence < 0.5).length,
    },
  };
}
