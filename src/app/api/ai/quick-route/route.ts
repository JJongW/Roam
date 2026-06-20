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
import { FLOORPLANS } from "@/lib/floorplans";
import { hasGemini, generateJSON } from "@/lib/ai/gemini";
import {
  aiRoutePreferencesSchema,
  buildPreferencePrompt,
  mapToPreference,
} from "@/lib/ai/route-preferences";

const bodySchema = z.object({
  exhibitionSlug: z.string().min(1),
  text: z.string().trim().min(1, "요청을 입력해 주세요").max(500),
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
    const { exhibitionSlug, text } = parsed.data;

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
    const route = await repo.saveRoute(
      session.id,
      rank.exhibitionId,
      {
        boothIds: plan.boothIds,
        estimatedMinutes: plan.estimatedMinutes,
        legs: plan.legs,
        scores: plan.scores,
        currentBoothId: plan.boothIds[0],
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
    });
  });
}
