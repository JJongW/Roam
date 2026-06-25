import { z } from "zod";
import { ok, notFound, parseBody, withErrorBoundary } from "@/lib/api/http";
import { getRepository } from "@/lib/repositories";
import { ensureSession, getCurrentUser } from "@/lib/api/session";
import { buildPlan, rankForExhibition } from "@/lib/engine/service";
import { buildHallSweepRoute } from "@/lib/engine/route";
import { FLOORPLANS } from "@/lib/floorplans";
import { hasGemini } from "@/lib/env";
import { recommendBoothIds } from "@/lib/ai/booth-recommender";
import { describeContext } from "@/lib/onboarding/onboarding-inference";
import { buildProfileFromContext } from "@/lib/onboarding/route-profile-builder";
import { emptyOnboardingContext } from "@/lib/onboarding/onboarding-types";
import type { OnboardingContext } from "@/lib/onboarding/onboarding-types";
import type { Booth, Point } from "@/lib/types";

const contextSchema = z.object({
  planningStage: z.string().optional(),
  visitDateType: z.string().optional(),
  visitDate: z.string().optional(),
  intent: z.string().optional(),
  dynamicAnswers: z
    .record(z.string(), z.union([z.string(), z.array(z.string())]))
    .default({}),
  preferences: z.array(z.string()).default([]),
  availableTime: z.string().optional(),
  routeStyle: z.string().optional(),
  avoidances: z.array(z.string()).default([]),
});

const bodySchema = z.object({
  exhibitionSlug: z.string().min(1),
  context: contextSchema,
});

/**
 * 온보딩 동선 생성 (LLM 주도, retrieve → rerank+ground → order).
 *
 * 1) 결정론 랭킹으로 후보를 추리고(빠름), 2) Gemini가 웹검색·URL·RAG로 후보를
 * 골라 재정렬하고, 3) 결정론 엔진이 기하·시간으로 순서를 잡는다. Gemini가
 * 없거나 실패/타임아웃이면 결정론 결과를 그대로 쓴다(항상 동선을 돌려준다).
 *
 * 명시적 "동선 만들기" 액션이라 몇 초 지연이 허용된다(클라가 로딩 UX를 띄움).
 */
export async function POST(req: Request) {
  return withErrorBoundary(async () => {
    const parsed = await parseBody(req, bodySchema);
    if (!parsed.ok) return parsed.res;
    const { exhibitionSlug, context } = parsed.data;

    const repo = await getRepository();
    const detail = await repo.getExhibition(exhibitionSlug);
    if (!detail) return notFound("전시를 찾을 수 없습니다");

    const ctx = {
      ...emptyOnboardingContext(),
      ...context,
    } as OnboardingContext;

    const built = buildProfileFromContext(ctx, detail.categories);
    const preference = built.preference;

    const rank = await rankForExhibition(exhibitionSlug, preference);
    if (!rank) return notFound("전시를 찾을 수 없습니다");

    const session = await ensureSession(rank.exhibitionId);
    const user = await getCurrentUser();
    await repo.savePreference(session.id, preference);

    const start: Point | undefined = FLOORPLANS[exhibitionSlug]?.entrance;

    // 결정론 baseline — 폴백이자 선택 개수(limit)의 기준.
    const baseline = buildPlan(rank, preference, start);
    const byId = new Map(rank.booths.map((b) => [b.id, b]));

    // 최종 부스 집합: LLM이 고르면 그걸, 아니면 baseline. 항상 홀-스윕으로 정렬해
    // A↔B 왕복(지그재그)을 막는다.
    let finalIds = baseline.boothIds;
    let reason = built.reason;
    let source = "deterministic";

    if (hasGemini && rank.ranked.length > 0) {
      try {
        const userBrief = [describeContext(ctx), built.reason]
          .filter(Boolean)
          .join("\n");
        const limit = Math.max(3, baseline.boothIds.length || 8);
        const rec = await recommendBoothIds({
          candidates: rank.ranked,
          userBrief,
          limit,
          grounded: false, // 온보딩은 빠른 내부 RAG (웹검색 없음)
        });
        if (rec.boothIds.length > 0) {
          finalIds = rec.boothIds;
          reason = rec.reason || reason;
          source = "gemini";
        }
      } catch (e) {
        console.error("[onboarding/route] LLM rerank failed, fallback", e);
      }
    }

    const finalBooths = finalIds
      .map((id) => byId.get(id))
      .filter((b): b is Booth => Boolean(b));
    const ordered = buildHallSweepRoute(
      finalBooths,
      start ?? { x: 0, y: 0 },
      baseline.scores,
    );
    const boothIds = ordered.boothIds;
    const legs = ordered.legs;
    const estimatedMinutes = ordered.estimatedMinutes;

    const route = await repo.saveRoute(
      session.id,
      rank.exhibitionId,
      {
        boothIds,
        estimatedMinutes,
        legs,
        scores: baseline.scores,
        currentBoothId: boothIds[0],
      },
      user?.id,
    );
    await repo.recordAnalytics(session.id, rank.exhibitionId, {
      type: "route_start",
    });

    return ok({ route, reason, source });
  });
}
