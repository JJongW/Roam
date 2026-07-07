// 관심 피드 큐레이션 — L4 브레인(누적 관심)으로 안정·낯선·모험 믹스를 만든다(explore/exploit).
// companion-reframe §7.4: 전부 가라가 아니라 "무엇을 남길지 고르는 재료". LLM 없음.
import "server-only";
import { diversifyCandidates, interestScore } from "@/lib/engine/scoring";
import { rankForExhibition } from "@/lib/engine/service";
import { brainInterestWeights, mergeBrainInterests } from "@/lib/memory/apply";
import { readBrain } from "@/lib/memory/service";
import { VALUE_SLUGS, boothValueSlugs } from "@/lib/values";
import type { Booth, UserBrain } from "@/lib/types";

export type PickKind = "stable" | "unfamiliar" | "adventure";

export interface FeedItem {
  booth: Booth;
  /** 태그 유사도가 높은 관련 부스(스레드 확장용). */
  related: Booth[];
  /** 큐레이션 갈래: 안정(취향 확실)·낯선(인접)·모험(미접촉 가치 발굴). */
  pick: PickKind;
}

/** 대상 부스의 가치 슬러그와 교집합 유사도 상위 n개(자기 제외, 점수>0). */
function relatedBooths(pool: Booth[], target: Booth, n = 3): Booth[] {
  return pool
    .filter((b) => b.id !== target.id)
    .map((b) => ({ b, s: interestScore(b, boothValueSlugs(target)) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, n)
    .map((x) => x.b);
}

/** 사용자가 아직 접촉하지 않은 가치에서 가장 강한 부스 하나(발굴/serendipity). */
function pickAdventure(
  pool: Booth[],
  brain: UserBrain,
  used: Set<string>,
): Booth | null {
  const engaged = new Set(
    brain.interests.filter((n) => n.confidence >= 0.3).map((n) => n.key),
  );
  const cold = new Set(VALUE_SLUGS.filter((v) => !engaged.has(v)));
  let best: Booth | null = null;
  let bestS = 0;
  for (const b of pool) {
    if (used.has(b.id)) continue;
    const s = Math.max(
      0,
      ...(b.valueTags ?? [])
        .filter((v) => cold.has(v.slug))
        .map((v) => v.strength),
    );
    if (s > bestS) {
      bestS = s;
      best = b;
    }
  }
  return best;
}

/** 안정 3 · 낯선 2 · 모험 1 믹스(≤6). 빈 브레인이면 인기순이 안정픽이 된다. */
export async function curateFeed(
  slug: string,
  userId: string,
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

  const items: FeedItem[] = [];
  const used = new Set<string>();
  const add = (booth: Booth, pick: PickKind) => {
    items.push({ booth, related: relatedBooths(rank.booths, booth, 3), pick });
    used.add(booth.id);
  };

  // 안정픽 3 — 상위 개인화(다양화)
  for (const s of diversifyCandidates(rank.ranked, 3)) add(s.booth, "stable");
  // 낯선픽 2 — 남은 랭킹에서 인접 발견
  const rest = rank.ranked.filter((s) => !used.has(s.booth.id));
  for (const s of diversifyCandidates(rest, 2)) add(s.booth, "unfamiliar");
  // 모험픽 1 — 미접촉 가치에서 발굴
  const adv = pickAdventure(rank.booths, brain, used);
  if (adv) add(adv, "adventure");

  return items;
}
