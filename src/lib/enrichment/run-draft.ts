import { extractJSON, generateGrounded } from "@/lib/ai/gemini";
import {
  needsDraft,
  draftSystemPrompt,
  draftUserPrompt,
  missingFields,
} from "@/lib/enrichment/draft-prompt";
import { gradeCandidate } from "@/lib/enrichment/quality-gate";
import { exhibitionLessons, rejectionsByBooth } from "@/lib/enrichment/lessons";
import {
  reviewPolicy,
  exhibitionTrust,
  exhaustedBooths,
  draftRounds,
  MAX_DRAFT_ROUNDS,
} from "@/lib/enrichment/review-policy";
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
  /** 사람 없이 바로 부스에 반영된 수. 이게 "부스당 사람 손 시간"을 줄이는 지점이다. */
  autoPassed: number;
  /** 사람이 봐야 하는 수. drafted - autoPassed. */
  needsReview: number;
  /** 상한까지 썼는데 근거를 못 찾아 기계가 손을 뗀 부스. 사람이 직접 찾을 목록이다. */
  exhausted: number;
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
    return { error: `행사를 찾을 수 없어요: ${input.exhibitionSlug}` };
  }

  const [booths, categories] = await Promise.all([
    repo.listBoothsFull(exhibitionId),
    repo.listCategories(exhibitionId),
  ]);
  const categoryName = new Map(categories.map((c) => [c.id, c.name]));

  // `needsDraft`는 "저작 필드가 비었나"만 본다. 그래서 재초안으로 빠진 부스는
  // 다음 배치에서 **자동으로 다시 대상이 된다** — 그게 재시도 고리다. 다만
  // 상한이 없으면 근거가 아예 없는 부스를 영원히 다시 쓰며 요금만 쌓는다.
  const everyCandidate = await repo.listEnrichmentCandidates({ exhibitionId, limit: 5000 });
  const exhausted = exhaustedBooths(everyCandidate);
  const rounds = draftRounds(everyCandidate);

  const wanted = input.codes?.length
    ? booths.filter((b) => b.code && input.codes!.includes(b.code))
    : booths
        // 시설(라운지·센터)은 참가사가 아니라 초안 대상이 아니다.
        .filter((b) => b.kind !== "facility")
        .filter((b) => needsDraft(b.enrichment))
        // 두 번 썼는데 아직 근거를 못 찾았으면 기계는 손을 뗀다 — 사람 몫이다.
        .filter((b) => !exhausted.has(b.id));
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
      //
      // 그리고 **0.60 아래는 사람에게 올리지 않는다.** 근거를 못 찾은 글을
      // 검수자가 봐도 할 수 있는 게 없다 — 다시 찾는 건 기계가 할 일이다.
      // 시도마다 질문을 바꿔 다른 각도로 검색하게 하고, 가장 좋은 것만 남긴다.
      const ANGLES = [
        "",
        "\n\n브랜드의 **공식 웹사이트와 자사 소개**를 먼저 찾아 읽어라. 쇼핑몰 상품 페이지나 다른 박람회 참가사 목록은 근거로 쓰지 마라.",
        `\n\n"${booth.name}"과 이름이 비슷한 다른 브랜드와 헷갈리지 마라. 이 행사(${input.exhibitionSlug})에 참가하는 그 브랜드인지 확인되는 근거만 써라. 확인이 안 되면 그 필드를 비워라.`,
      ];
      let best: {
        payload: BoothEnrichmentPatch;
        sources: { uri: string; title?: string }[];
        report: ReturnType<typeof gradeCandidate>;
      } | null = null;

      for (const angle of ANGLES) {
        let payload: BoothEnrichmentPatch | null = null;
        let sources: { uri: string; title?: string }[] = [];
        for (const attempt of [
          userPrompt + angle,
          `${userPrompt}${angle}\n\n반드시 JSON 객체 하나만 출력한다. 다른 텍스트를 쓰지 않는다.`,
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
        if (!payload) continue;

        // 요청하지 않은 필드는 버린다 — 사람이 쓴 값을 초안이 덮을 자리를 안 만든다.
        const kept = Object.fromEntries(
          Object.entries(payload).filter(([k]) => missing.includes(k)),
        ) as BoothEnrichmentPatch;
        const report = gradeCandidate({
          payload: kept,
          sources,
          booth: { ...booth, categoryName: categoryName.get(booth.categoryId) },
          seenPhrases,
          seenActions,
          requested: missing,
          hadMaterial: Boolean(booth.description || booth.enrichment?.summary),
          organizerMaterial: Boolean(booth.description),
        });
        if (!best || report.confidence > best.report.confidence) {
          best = { payload: kept, sources, report };
        }
        // 사람에게 보낼 만한 점수가 나왔으면 더 안 찾는다 — 요금이 든다.
        if (reviewPolicy(report.confidence, report.issues).decision !== "redraft") break;
      }
      if (!best) throw new Error("JSON을 못 얻었어요(재시도 후에도)");

      const kept = best.payload;
      const sources = best.sources;
      const report = best.report;
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

  // ── 자동 통과 ─────────────────────────────────────────────────────────────
  // 코드로 먼저 가르고(`reviewPolicy`), 그 전시를 믿기로 했을 때만 내보낸다
  // (`exhibitionTrust`). 반영은 개별 승인과 **같은 경로**(upsertBoothEnrichment)를
  // 타므로 change_log에 남고, "자동 통과"라는 이유가 붙어 나중에 골라낼 수 있다.
  const auto = await autoPassPending(repo, exhibitionId, {
    boothIds: new Set(rows.map((r) => r.boothId)),
    actor: input.actor ?? null,
  });
  const autoPassed = auto.autoPassed;
  failures.push(...auto.failures);

  // 이번 배치로 상한을 채운 부스까지 더해 센다 — 사람 목록이 얼마나 늘었는지가
  // 이 실행의 결과다.
  const nowExhausted = new Set([
    ...exhausted,
    ...rows
      .filter(
        (r) =>
          (rounds.get(r.boothId) ?? 0) + 1 >= MAX_DRAFT_ROUNDS &&
          reviewPolicy(r.confidence, r.issues).decision === "redraft",
      )
      .map((r) => r.boothId),
  ]);

  return {
    requested: targets.length,
    drafted: rows.length,
    autoPassed,
    needsReview: rows.length - autoPassed,
    exhausted: nowExhausted.size,
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

/**
 * 대기 중인 초안 중 자동 통과 조건을 넘는 것을 반영한다. 초안 직후와 **재채점 직후**
 * 둘 다 부른다 — 예전엔 초안 때만 돌아서, 게이트 규칙을 고치고 재채점해 0.95를
 * 넘겨도 사람이 승인하기 전까지 영원히 대기에 남았다(주류박람회, 2026-10-01).
 */
export async function autoPassPending(
  repo: Repository,
  exhibitionId: string,
  opts: { boothIds?: Set<string>; actor: string | null },
): Promise<{
  autoPassed: number;
  /** 이 전시를 믿기로 했는지. 화면이 "표본 N/25" 로 보여준다. */
  trust: ReturnType<typeof exhibitionTrust>;
  failures: { code: string; message: string }[];
}> {
  let autoPassed = 0;
  const failures: { code: string; message: string }[] = [];
  const fresh = await repo.listEnrichmentCandidates({
    exhibitionId,
    status: "pending",
    limit: 1000,
  });
  // 이 전시를 믿을지부터 정한다. 아직 표본이 덜 찼거나 표본 승인률이 낮으면
  // 엄격한 문턱을 쓴다 — 위험은 고르게 퍼져 있지 않고 전시 하나에 몰려 있었다.
  const trust = exhibitionTrust(
    await repo.listEnrichmentCandidates({ exhibitionId, limit: 5000 }),
  );

  for (const c of fresh) {
    if (opts.boothIds && !opts.boothIds.has(c.boothId)) continue;
    const policy = reviewPolicy(c.confidence, c.issues, trust.policy);
    if (policy.decision !== "auto_pass") continue;
    try {
      await repo.upsertBoothEnrichment(
        c.boothId,
        c.payload as BoothEnrichmentPatch,
        {
          source: "drafter",
          actor: opts.actor,
          reason: `자동 통과(신뢰도 ${c.confidence.toFixed(2)}, 근거 ${c.sources.length}건) — ${trust.reason}`,
        },
      );
      await repo.setCandidateStatus(c.id, "approved", null, "자동 통과");
      autoPassed += 1;
    } catch (e) {
      failures.push({
        code: c.boothId,
        message: `자동 반영 실패: ${e instanceof Error ? e.message : String(e)}`,
      });
    }
  }
  return { autoPassed, trust, failures };
}
