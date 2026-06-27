import { z } from "zod";
import { ok, notFound, parseBody, withErrorBoundary } from "@/lib/api/http";
import { getRepository } from "@/lib/repositories";
import { ensureSession, getCurrentUser } from "@/lib/api/session";
import { buildPlan, rankForExhibition } from "@/lib/engine/service";
import { buildHallSweepRoute, pruneToBudget } from "@/lib/engine/route";
import { attachDwellMinutes } from "@/lib/booth/dwell";
import { FLOORPLANS } from "@/lib/floorplans";
import { hasGemini } from "@/lib/env";
import { recommendBoothIds } from "@/lib/ai/booth-recommender";
import { describeContext } from "@/lib/onboarding/onboarding-inference";
import { buildProfileFromContext } from "@/lib/onboarding/route-profile-builder";
import { emptyOnboardingContext } from "@/lib/onboarding/onboarding-types";
import type { OnboardingContext } from "@/lib/onboarding/onboarding-types";
import type { Booth, Point } from "@/lib/types";

const contextSchema = z.object({
  boothPlan: z.string().optional(),
  selectedBoothIds: z.array(z.string()).default([]),
  wantRelatedBooths: z.boolean().optional(),
  visitDateType: z.string().optional(),
  visitDate: z.string().optional(),
  intents: z.array(z.string()).default([]),
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

    // 전체 부스(후보 밖이어도 사용자가 직접 고른 부스는 반드시 동선에 포함해야
    // 하므로 ranked가 아니라 전체 목록으로 id를 해석한다).
    const allBooths = await repo.listBoothsByExhibitionId(rank.exhibitionId);
    attachDwellMinutes(exhibitionSlug, allBooths);
    const allById = new Map(allBooths.map((b) => [b.id, b]));

    // has_booths 분기에서 직접 고른 부스(유효한 것만). 항상 동선에 들어간다.
    const keepIds = (ctx.selectedBoothIds ?? []).filter((id) =>
      allById.has(id),
    );

    let reason = built.reason;
    let source = "deterministic";

    // LLM/baseline로 추천 부스를 구한다. 단, 직접 고른 부스만 원하면(관련 부스
    // 비희망) 추천을 아예 건너뛰고 고른 부스만 쓴다.
    let recommended: string[] = [];
    const skipRecommend = keepIds.length > 0 && ctx.wantRelatedBooths === false;

    if (!skipRecommend) {
      recommended = baseline.boothIds;
      source = keepIds.length ? "user_selected+deterministic" : "deterministic";
      if (hasGemini && rank.ranked.length > 0) {
        try {
          // 고른 부스가 있으면 그 이름을 brief에 넣어 "관련/유사" 추천을 유도한다.
          const keepNames = keepIds
            .map((id) => allById.get(id)?.name)
            .filter(Boolean);
          const userBrief = [
            describeContext(ctx),
            keepNames.length
              ? `사용자가 이미 고른 부스: ${keepNames.join(", ")}. 이와 관련되거나 보완되는 부스를 추천해.`
              : "",
            built.reason,
          ]
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
            recommended = rec.boothIds;
            reason = rec.reason || reason;
            source = keepIds.length ? "user_selected+gemini" : "gemini";
          }
        } catch (e) {
          console.error("[onboarding/route] LLM rerank failed, fallback", e);
        }
      }
    } else {
      source = "user_selected";
      reason = "직접 고른 부스로 동선을 짰어.";
    }

    // 최종 부스 집합: 고른 부스(우선) + 추천. 중복 제거. 항상 홀-스윕으로 정렬해
    // A↔B 왕복(지그재그)을 막는다.
    const finalIds = [...new Set([...keepIds, ...recommended])];
    const finalBooths = finalIds
      .map((id) => allById.get(id))
      .filter((b): b is Booth => Boolean(b));
    // 시간예산 가지치기: 직접 고른 부스(keepIds)는 항상 남기고, 추천은 점수순으로
    // 예산만큼만 더한다. 그 다음 홀-스윕 정렬로 지그재그를 막는다.
    const pruned = pruneToBudget(
      finalBooths,
      keepIds,
      baseline.scores,
      preference.availableMinutes,
      start ?? { x: 0, y: 0 },
    );
    const ordered = buildHallSweepRoute(
      pruned,
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
