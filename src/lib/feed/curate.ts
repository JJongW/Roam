// 관심 피드 큐레이션 — L4 브레인(누적 관심)으로 안정·낯선·모험 믹스를 만든다(explore/exploit).
// companion-reframe §7.4: 전부 가라가 아니라 "무엇을 남길지 고르는 재료". LLM 없음.
import "server-only";
import { CONFIDENT_THRESHOLD } from "@/lib/constants";
import { diversifyCandidates, interestScore } from "@/lib/engine/scoring";
import { rankForExhibition } from "@/lib/engine/service";
import { brainInterestWeights, mergeBrainInterests } from "@/lib/memory/apply";
import { readBrain } from "@/lib/memory/service";
import { getRepository } from "@/lib/repositories";
import { deriveCue } from "@/lib/feed/cue";
import { buildGrounding, type Grounding } from "@/lib/feed/grounding";
import { DEFAULT_RHYTHM, RHYTHM_MIX, type Rhythm } from "@/lib/feed/rhythm";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config";
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
  locale: Locale = DEFAULT_LOCALE,
  /** 호출부가 이미 읽었으면 넘긴다 — 같은 요청에서 브레인을 두 번 읽지 않도록. */
  preloadedBrain?: UserBrain,
): Promise<FeedItem[]> {
  const brain = preloadedBrain ?? (await readBrain(userId));
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
    .filter(
      (n) => n.confidence >= CONFIDENT_THRESHOLD && VALUE_SLUGS.includes(n.key),
    )
    .map((n) => n.key);

  // 판단이 끝난 부스는 피드에서 뺀다 — 네 반응 전부. 피드는 6칸짜리 결정 큐라
  // (rhythm.ts) 이미 정한 부스가 칸을 차지하면 새 후보가 올라올 자리가 없다.
  // 특히 '끌림'은 그 가치의 가중치를 올려서 같은 부스를 **더 위로** 끌어올렸다 —
  // 반응할수록 같은 카드가 1번 자리에 눌러앉는 구조였다. 다시 보는 곳은 지도(색)와
  // 내 메모장(네 상태 다 표시)이다. 노트는 서버에 있어 재접속해도 유지된다.
  const repo = await getRepository();
  const notes = await repo.listNotes(userId);
  const decided = new Set(notes.filter((n) => n.status).map((n) => n.boothId));

  // "왜 지금 너한테"를 가치 이름이 아니라 **내가 실제로 누른 부스**로 말하기 위한 표.
  // 최근에 긍정 반응한 부스부터 보고, 후보와 가치가 겹치는 첫 부스를 근거로 삼는다.
  // (겹치는 게 없으면 근거를 안 붙인다 — 없는 이유를 지어내지 않는다.)
  const boothById = new Map(rank.booths.map((b) => [b.id, b]));
  const positives = notes
    .filter((n) => n.status === "interested" || n.status === "visited")
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map((n) => ({
      booth: boothById.get(n.boothId),
      kind: n.status as "interested" | "visited",
    }))
    .filter((p): p is { booth: Booth; kind: "interested" | "visited" } =>
      Boolean(p.booth),
    );

  // 근거는 피드에서 **한 번만** 말한다. 여섯 장에 다 붙이면 "아까 X에 끌림 눌러서"가
  // 여섯 번 반복돼, 라벨만 다르고 본문은 같던 예전 문제로 되돌아간다. 그리고 부스가
  // 무엇인지 말할 수 없는 카드엔 붙이지 않는다 — 근거만 덩그러니 남으면 이 부스가
  // 뭔지도 모른 채 이유만 듣는 꼴이다.
  let linkUsed = false;
  const hasFact = (b: Booth) =>
    Boolean(
      b.enrichment?.roamInterpretation ||
      b.enrichment?.summary ||
      b.enrichment?.goodsKeywords?.length,
    );
  const becauseOf = (booth: Booth) => {
    if (linkUsed || !hasFact(booth)) return undefined;
    const vals = new Set(boothValueSlugs(booth));
    const hit = positives.find(
      (p) =>
        p.booth.id !== booth.id &&
        boothValueSlugs(p.booth).some((v) => vals.has(v)),
    );
    if (!hit) return undefined;
    linkUsed = true;
    return { name: hit.booth.name, kind: hit.kind };
  };

  // 후보 풀에서 먼저 걷어낸다. used에만 넣으면 안정픽이 rank.ranked를 그대로
  // 훑으면서 add()가 used를 검사하지 않고 push하므로 이미 정한 부스가 그대로 남는다
  // — 가장 위에 보이는 픽이라 "반응해도 안 바뀐다"로 느껴진다.
  const eligible = rank.ranked.filter((s) => !decided.has(s.booth.id));

  const items: FeedItem[] = [];
  const used = new Set(decided);
  const add = (booth: Booth, pick: PickKind) => {
    items.push({
      booth,
      related: relatedBooths(
        rank.booths.filter((b) => !decided.has(b.id)),
        booth,
        3,
      ),
      pick,
      cue: deriveCue(booth, rank.eventsByBooth[booth.id] ?? []),
      grounding: buildGrounding(
        booth,
        userValueSlugs,
        locale,
        becauseOf(booth),
      ),
    });
    used.add(booth.id);
  };

  const mix = RHYTHM_MIX[rhythm];
  // 안정픽 — 상위 개인화(다양화)
  for (const s of diversifyCandidates(eligible, mix.stable))
    add(s.booth, "stable");
  // 낯선픽 — 남은 랭킹에서 인접 발견
  const rest = eligible.filter((s) => !used.has(s.booth.id));
  for (const s of diversifyCandidates(rest, mix.unfamiliar))
    add(s.booth, "unfamiliar");
  // 모험픽 — 미접촉 가치에서 발굴
  for (let i = 0; i < mix.adventure; i++) {
    const adv = pickAdventure(rank.booths, brain, used);
    if (adv) add(adv, "adventure");
  }

  return items;
}
