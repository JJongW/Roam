import { z } from "zod";
import { ok, notFound, parseBody, withErrorBoundary } from "@/lib/api/http";
import { getRepository } from "@/lib/repositories";
import { hasGemini } from "@/lib/env";
import { inferOnboardingProfile } from "@/lib/onboarding/onboarding-inference";
import { buildProfileFromContext } from "@/lib/onboarding/route-profile-builder";
import { emptyOnboardingContext } from "@/lib/onboarding/onboarding-types";
import type { OnboardingContext } from "@/lib/onboarding/onboarding-types";

/** 클라이언트가 보낸 온보딩 컨텍스트 — 느슨하게 받아 안전한 기본값으로 정규화. */
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
 * 온보딩 추론 — 누적 컨텍스트 → 추론 프로필(요약·동선 이름·이유·interests slug).
 *
 * 클라이언트가 가용 시간 스텝 직후 백그라운드로 prefetch 한다(논블로킹). 그래서
 * 사용자가 요약 화면에 도달할 즈음엔 결과가 와 있고, 탭 경로는 절대 막지 않는다.
 * Gemini가 없거나 실패하면 결정론 빌더 결과로 폴백 → 항상 200을 돌려준다.
 */
export async function POST(req: Request) {
  return withErrorBoundary(async () => {
    const parsed = await parseBody(req, bodySchema);
    if (!parsed.ok) return parsed.res;
    const { exhibitionSlug, context } = parsed.data;

    const repo = await getRepository();
    const detail = await repo.getExhibition(exhibitionSlug);
    if (!detail) return notFound("전시를 찾을 수 없습니다");

    // 클라이언트가 보낸 값은 느슨한 string — 빌더/추론은 Record 조회 + 기본값으로
    // 안전하게 다루므로 도메인 타입으로 단언한다.
    const ctx = {
      ...emptyOnboardingContext(),
      ...context,
    } as OnboardingContext;

    // 결정론 빌더는 항상 유효한 폴백을 만든다.
    const built = buildProfileFromContext(ctx, detail.categories);

    if (!hasGemini) {
      return ok({
        source: "deterministic",
        summary: "",
        priorityTags: built.priorityTags,
        routeName: built.routeName,
        reason: built.reason,
        strategy: built.strategy,
        interests: built.preference.interests,
      });
    }

    try {
      // 부스 enrichment에서 굿즈·테마 어휘를 모아 추론에 참고시킨다(수동 주입분).
      const booths = await repo.listBoothsByExhibitionId(detail.exhibition.id);
      const boothVocab = [
        ...new Set(
          booths.flatMap((b) => [
            ...(b.enrichment?.goodsKeywords ?? []),
            ...(b.enrichment?.themeTags ?? []),
          ]),
        ),
      ];
      const inf = await inferOnboardingProfile(
        ctx,
        detail.categories,
        boothVocab,
      );
      return ok({
        source: "gemini",
        summary: inf.summary || "",
        priorityTags: inf.priorityTags.length
          ? inf.priorityTags
          : built.priorityTags,
        routeName: inf.routeName || built.routeName,
        reason: inf.recommendationReason || built.reason,
        strategy: inf.routeStrategy || built.strategy,
        // Gemini가 고른 실제 slug가 있으면 그걸, 없으면 빌더의 휴리스틱 interests.
        interests: inf.interestsResolved.length
          ? inf.interestsResolved
          : built.preference.interests,
      });
    } catch (e) {
      console.error("[onboarding/infer] gemini failed, falling back", e);
      return ok({
        source: "fallback",
        summary: "",
        priorityTags: built.priorityTags,
        routeName: built.routeName,
        reason: built.reason,
        strategy: built.strategy,
        interests: built.preference.interests,
      });
    }
  });
}
