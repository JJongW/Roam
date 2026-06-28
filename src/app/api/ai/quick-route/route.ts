import { z } from "zod";
import { getRepository } from "@/lib/repositories";
import {
  ok,
  fail,
  notFound,
  parseBody,
  withErrorBoundary,
} from "@/lib/api/http";
import { ensureSession, getCurrentUser } from "@/lib/api/session";
import { buildPlan, rankForExhibition } from "@/lib/engine/service";
import { buildHallSweepRoute, pruneToBudget } from "@/lib/engine/route";
import { attachDwellMinutes } from "@/lib/booth/dwell";
import { FLOORPLANS } from "@/lib/floorplans";
import { hasGemini, generateJSON } from "@/lib/ai/gemini";
import { recommendBoothIds } from "@/lib/ai/booth-recommender";
import {
  aiRoutePreferencesSchema,
  buildPreferencePrompt,
  mapToPreference,
} from "@/lib/ai/route-preferences";

const bodySchema = z.object({
  exhibitionSlug: z.string().min(1),
  text: z.string().trim().min(1, "요청을 입력해 주세요").max(500),
  /** Interests already chosen (onboarding) — blended into the result. */
  interests: z.array(z.string()).optional(),
  /** Booths the visitor already added — kept and woven into the new route. */
  keepBoothIds: z.array(z.string()).optional(),
});

/**
 * AI Quick Recommendation: a single natural-language prompt → a full route,
 * reusing the same ranking/plan engine as the 5-step onboarding. Gemini only
 * produces a validated preference; route building stays deterministic.
 */
export async function POST(req: Request) {
  return withErrorBoundary(async () => {
    if (!hasGemini) return fail("INTERNAL", "AI 추천이 설정되지 않았어요");

    const parsed = await parseBody(req, bodySchema);
    if (!parsed.ok) return parsed.res;
    const { exhibitionSlug, text, interests, keepBoothIds } = parsed.data;

    const repo = await getRepository();
    const detail = await repo.getExhibition(exhibitionSlug);
    if (!detail) return notFound("전시를 찾을 수 없습니다");

    // Parse the prompt into a validated preference (AI), then map to the app's
    // strict schema deterministically.
    let mapped: ReturnType<typeof mapToPreference>;
    let confidence = 0.5;
    try {
      const ai = await generateJSON({
        prompt: buildPreferencePrompt(text, detail.categories),
        schema: aiRoutePreferencesSchema,
      });
      mapped = mapToPreference(ai, detail.categories);
      confidence = ai.confidence;
      // Blend in interests the visitor already picked (onboarding) so the chat
      // result respects them too.
      if (interests?.length) {
        mapped.preference.interests = [
          ...new Set([...mapped.preference.interests, ...interests]),
        ];
      }
    } catch (e) {
      console.error("[ai/quick-route] parse failed", e);
      return fail(
        "UNPROCESSABLE",
        "AI가 잠시 혼잡해요. 잠시 후 다시 시도해 주세요",
      );
    }

    // Build + persist the route exactly like POST /api/route.
    const rank = await rankForExhibition(exhibitionSlug, mapped.preference);
    if (!rank) return notFound("전시를 찾을 수 없습니다");

    const session = await ensureSession(rank.exhibitionId);
    const user = await getCurrentUser();
    await repo.savePreference(session.id, mapped.preference);

    const start = FLOORPLANS[exhibitionSlug]?.entrance;
    const plan = buildPlan(rank, mapped.preference, start);

    // 다른 방문객 쿼리에서 자주 나온 키워드(트렌딩)를 추천 신호로 함께 준다.
    const trending = (await repo.topQueryKeywords(rank.exhibitionId, 12)).map(
      (t) => t.keyword,
    );

    // LLM 주도 선택: 결정론 후보 위에서 Gemini가 요청 맥락으로 골라 재정렬한다
    // (웹검색·URL·RAG 활성 = grounded). 실패하면 결정론 plan을 그대로 쓴다.
    let selectedIds = plan.boothIds;
    let recKeywords: string[] = [];
    let reason = "";
    let source: "ai" | "deterministic" = "deterministic";
    if (rank.ranked.length > 0) {
      try {
        const rec = await recommendBoothIds({
          candidates: rank.ranked,
          userBrief: [text, mapped.chips.join(" · ")]
            .filter(Boolean)
            .join("\n"),
          // 예산 비례로 넉넉히(부스당 ~6분). 실제 시간 맞춤은 pruneToBudget.
          limit: Math.min(
            rank.ranked.length,
            Math.max(
              15,
              plan.boothIds.length,
              Math.round(mapped.preference.availableMinutes / 6),
            ),
          ),
          grounded: true, // 지도 AI 추천은 웹검색·URL 활성
          trendingKeywords: trending,
        });
        if (rec.boothIds.length > 0) {
          selectedIds = rec.boothIds;
          reason = rec.reason || "";
          source = "ai";
        }
        recKeywords = rec.keywords;
      } catch (e) {
        console.error("[ai/quick-route] LLM rerank failed, fallback", e);
      }
    }

    // 이 쿼리를 로그에 적재 — 누적 키워드 추적(RAG)에 쓴다. 베스트에포트.
    repo
      .logAiQuery(session.id, rank.exhibitionId, {
        text,
        keywords: recKeywords.length ? recKeywords : mapped.chips,
      })
      .catch(() => {});

    // keepBoothIds가 주어지면(=토글 ON) 기존 동선에 더해 병합, 아니면 교체.
    // 어느 쪽이든 홀-스윕으로 정렬해 A↔B 왕복(지그재그)을 막는다.
    const all = await repo.listBoothsByExhibitionId(rank.exhibitionId);
    attachDwellMinutes(exhibitionSlug, all);
    const byId = new Map(all.map((b) => [b.id, b]));
    const merged = [...new Set([...(keepBoothIds ?? []), ...selectedIds])]
      .map((id) => byId.get(id))
      .filter((b): b is NonNullable<typeof b> => Boolean(b));
    // 시간예산 가지치기: 직접 담은 부스(keep)는 항상 남기고, 추천은 점수순으로
    // 예산이 허락하는 만큼만 더한다. 그 다음 홀-스윕으로 순서 정렬.
    const pruned = pruneToBudget(
      merged,
      keepBoothIds ?? [],
      plan.scores,
      mapped.preference.availableMinutes,
      start ?? { x: 0, y: 0 },
    );
    const reordered = buildHallSweepRoute(pruned, start ?? { x: 0, y: 0 });
    const boothIds = reordered.boothIds;
    const legs = reordered.legs;
    const estimatedMinutes = reordered.estimatedMinutes;

    const route = await repo.saveRoute(
      session.id,
      rank.exhibitionId,
      {
        boothIds,
        estimatedMinutes,
        legs,
        scores: plan.scores,
        currentBoothId: boothIds[0],
      },
      user?.id,
    );
    await repo.recordAnalytics(session.id, rank.exhibitionId, {
      type: "route_start",
    });

    return ok({
      route,
      preference: mapped.preference,
      chips: mapped.chips,
      unmatched: mapped.unmatched,
      confidence,
      // 과정·결과 표시용: 확장 키워드 / 추천 이유 / 소스(AI·결정론) / 부스 수.
      keywords: recKeywords,
      reason,
      source,
      count: boothIds.length,
    });
  });
}
