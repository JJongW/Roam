// 관심 피드 큐레이션 — L4 브레인(누적 관심)으로 부스를 정렬해 top-N(<6) 추리고,
// 각 부스의 "관련 부스"(태그 유사도)를 미리 붙여 스레드 확장을 즉시 가능케 한다.
// 온보딩 추천과 동일 경로(readBrain→apply→rankForExhibition→diversify) 재사용. LLM 없음.
import "server-only";
import { diversifyCandidates, interestScore } from "@/lib/engine/scoring";
import { rankForExhibition } from "@/lib/engine/service";
import { brainInterestWeights, mergeBrainInterests } from "@/lib/memory/apply";
import { readBrain } from "@/lib/memory/service";
import type { Booth } from "@/lib/types";

export interface FeedItem {
  booth: Booth;
  /** 태그 유사도가 높은 관련 부스(스레드 확장용). */
  related: Booth[];
}

/** 클릭한 부스의 tags와 태그 교집합 유사도 상위 n개(자기 제외, 점수>0). */
function relatedBooths(pool: Booth[], target: Booth, n = 3): Booth[] {
  return pool
    .filter((b) => b.id !== target.id)
    .map((b) => ({ b, s: interestScore(b, target.tags) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, n)
    .map((x) => x.b);
}

/** 브레인 큐레이션 피드 top-N + 각 부스의 관련 부스. 빈 브레인이면 인기순 폴백. */
export async function curateFeed(
  slug: string,
  userId: string,
  n = 6,
): Promise<FeedItem[]> {
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
  return diversifyCandidates(rank.ranked, n).map((s) => ({
    booth: s.booth,
    related: relatedBooths(rank.booths, s.booth, 3),
  }));
}
