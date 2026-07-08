// 관심 피드 큐레이션 — L4 브레인(누적 관심)으로 안정·낯선·모험 믹스를 만든다(explore/exploit).
// companion-reframe §7.4: 전부 가라가 아니라 "무엇을 남길지 고르는 재료". LLM 없음.
import "server-only";
import { diversifyCandidates, interestScore } from "@/lib/engine/scoring";
import { rankForExhibition } from "@/lib/engine/service";
import { brainInterestWeights, mergeBrainInterests } from "@/lib/memory/apply";
import { readBrain } from "@/lib/memory/service";
import { deriveCue } from "@/lib/feed/cue";
import { buildGrounding, type Grounding } from "@/lib/feed/grounding";
import { DEFAULT_RHYTHM, RHYTHM_MIX, type Rhythm } from "@/lib/feed/rhythm";
import { VALUE_SLUGS, boothValueSlugs } from "@/lib/values";
import type { Booth, UserBrain } from "@/lib/types";

export type PickKind = "stable" | "unfamiliar" | "adventure";

export interface FeedItem {
  booth: Booth;
  /** 태그 유사도가 높은 관련 부스(스레드 확장용). */
  related: Booth[];
  /** 큐레이션 갈래: 안정(취향 확실)·낯선(인접)·모험(미접촉 가치 발굴). */
  pick: PickKind;
  /** 실시간 판단 큐(이벤트/타이밍 사실+이유). 없으면 undefined. */
  cue?: string;
  /** 근거 카드 — 무엇/왜맞음/근거/행동/신뢰(판단 재료). */
  grounding: Grounding;
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

/** 리듬별 믹스로 안정·낯선·모험을 뽑는다(기본 가볍게=3·2·1). 빈 브레인이면 인기순이 안정픽. */
export async function curateFeed(
  slug: string,
  userId: string,
  rhythm: Rhythm = DEFAULT_RHYTHM,
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

  // 사용자 상위 관심 가치(slug) — 근거 카드의 왜맞음 겹침 계산에 쓴다.
  const userValueSlugs = brain.interests
    .filter((n) => n.confidence >= 0.25 && VALUE_SLUGS.includes(n.key))
    .map((n) => n.key);

  const items: FeedItem[] = [];
  const used = new Set<string>();
  const add = (booth: Booth, pick: PickKind) => {
    items.push({
      booth,
      related: relatedBooths(rank.booths, booth, 3),
      pick,
      cue: deriveCue(booth, rank.eventsByBooth[booth.id] ?? []),
      grounding: buildGrounding(booth, userValueSlugs, pick),
    });
    used.add(booth.id);
  };

  const mix = RHYTHM_MIX[rhythm];
  // 안정픽 — 상위 개인화(다양화)
  for (const s of diversifyCandidates(rank.ranked, mix.stable))
    add(s.booth, "stable");
  // 낯선픽 — 남은 랭킹에서 인접 발견
  const rest = rank.ranked.filter((s) => !used.has(s.booth.id));
  for (const s of diversifyCandidates(rest, mix.unfamiliar))
    add(s.booth, "unfamiliar");
  // 모험픽 — 미접촉 가치에서 발굴
  for (let i = 0; i < mix.adventure; i++) {
    const adv = pickAdventure(rank.booths, brain, used);
    if (adv) add(adv, "adventure");
  }

  return items;
}
