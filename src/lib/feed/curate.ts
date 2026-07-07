// 관심 피드 큐레이션 — L4 브레인(누적 관심)으로 부스를 정렬해 top-N(<6) 추린다.
// 온보딩 추천과 동일 경로(readBrain→apply→rankForExhibition→diversify) 재사용. LLM 없음.
import "server-only";
import { diversifyCandidates } from "@/lib/engine/scoring";
import { rankForExhibition } from "@/lib/engine/service";
import { brainInterestWeights, mergeBrainInterests } from "@/lib/memory/apply";
import { readBrain } from "@/lib/memory/service";
import type { Booth } from "@/lib/types";

/** 사용자 브레인으로 큐레이션한 부스 top-N. 빈 브레인이면 인기순 폴백. */
export async function curateFeed(
  slug: string,
  userId: string,
  n = 6,
): Promise<Booth[]> {
  const brain = await readBrain(userId);
  const interests = mergeBrainInterests([], brain);
  const interestWeights = brainInterestWeights([], brain);
  const rank = await rankForExhibition(
    slug,
    {
      visitPurposes: ["experience"],
      interests,
      availableMinutes: 120,
      movementPreference: "balanced",
      companionType: "alone",
    },
    Date.now(),
    { interestWeights },
  );
  if (!rank) return [];
  return diversifyCandidates(rank.ranked, n).map((s) => s.booth);
}
