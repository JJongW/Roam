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
import { emptyBrain } from "@/lib/memory/distill";
import { VALUE_SLUGS, boothValueSlugs } from "@/lib/values";
import type { Booth, BoothNote, UserBrain } from "@/lib/types";

export type PickKind = "stable" | "unfamiliar" | "adventure";

/** 판단이 끝난 부스(피드에서 제외할 대상) — 순수, 테스트 가능. */
export function decidedBoothIds(
  notes: Pick<BoothNote, "boothId" | "interest" | "verdict">[],
): Set<string> {
  return new Set(
    notes.filter((n) => n.interest || n.verdict).map((n) => n.boothId),
  );
}

/** 근거 링크 후보 — verdict가 있으면 verdict가 이긴다(interest는 예측일 뿐, 방문
 *  후 판정이 최종). interest='must'+verdict='bad' 같은 조합에서 예전엔 interest
 *  쪽 OR로 걸려 "별로였던 부스가 긍정 근거로 샌다"는 버그가 있었다 — 지도 색·
 *  judgmentScore·JudgmentBar와 같은 verdict-우선 규칙을 여기도 적용한다
 *  (judgment-vocabulary 최종 리뷰 Fix 2). 순수, 테스트 가능. */
export function positiveNotes(
  notes: Pick<BoothNote, "boothId" | "interest" | "verdict" | "updatedAt">[],
): { boothId: string; kind: "must" | "curious" | "good" }[] {
  return notes
    .filter((n) =>
      n.verdict
        ? n.verdict === "good"
        : n.interest === "must" || n.interest === "curious",
    )
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map((n) => ({
      boothId: n.boothId,
      kind: (n.verdict === "good" ? "good" : n.interest) as
        "must" | "curious" | "good",
    }));
}

/**
 * 근거 링크 선택기 — 후보 부스와 가치가 겹치는 과거 긍정 반응 중 하나를 고른다.
 * 같은 과거 부스를 두 번 인용하지 않고(서로 다른 근거로 서로 다른 카드), 피드
 * 하나당 최대 maxUses번까지만 링크를 만든다. 순수 클로저, 테스트 가능.
 */
export function createLinkPicker(
  positives: { booth: Booth; kind: "must" | "curious" | "good" }[],
  maxUses = 2,
): (
  booth: Booth,
) => { name: string; kind: "must" | "curious" | "good" } | undefined {
  const usedBoothIds = new Set<string>();
  let uses = 0;
  return (booth: Booth) => {
    if (uses >= maxUses) return undefined;
    const vals = new Set(boothValueSlugs(booth));
    const hit = positives.find(
      (p) =>
        p.booth.id !== booth.id &&
        !usedBoothIds.has(p.booth.id) &&
        boothValueSlugs(p.booth).some((v) => vals.has(v)),
    );
    if (!hit) return undefined;
    usedBoothIds.add(hit.booth.id);
    uses++;
    return { name: hit.booth.name, kind: hit.kind };
  };
}

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

/** 리듬별 믹스로 안정·낯선·모험을 뽑는다(기본 가볍게=3·2·1). 빈 브레인이면 인기순이 안정픽.
 *  userId=null(비로그인) — 개인화 없이 인기순만. 판단 기록이 없어 뺄 부스도 없다. */
export async function curateFeed(
  slug: string,
  userId: string | null,
  rhythm: Rhythm = DEFAULT_RHYTHM,
  locale: Locale = DEFAULT_LOCALE,
  /** 호출부가 이미 읽었으면 넘긴다 — 같은 요청에서 브레인을 두 번 읽지 않도록. */
  preloadedBrain?: UserBrain,
): Promise<FeedItem[]> {
  const brain =
    preloadedBrain ?? (userId ? await readBrain(userId) : emptyBrain(""));
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

  // 판단이 끝난 부스는 피드에서 뺀다 — interest·verdict 둘 중 하나라도 있으면.
  // 피드는 6칸짜리 결정 큐라(rhythm.ts) 이미 정한 부스가 칸을 차지하면 새 후보가
  // 올라올 자리가 없다. 다시 보는 곳은 지도(색)와 내 메모장(네 상태 다 표시)이다.
  // 노트는 서버에 있어 재접속해도 유지된다.
  const notes = userId ? await (await getRepository()).listNotes(userId) : [];
  const decided = decidedBoothIds(notes);

  // "왜 지금 너한테"를 가치 이름이 아니라 **내가 실제로 누른 부스**로 말하기 위한 표.
  // 최근에 긍정 반응한 부스부터 보고, 후보와 가치가 겹치는 첫 부스를 근거로 삼는다.
  // (겹치는 게 없으면 근거를 안 붙인다 — 없는 이유를 지어내지 않는다.)
  //
  // verdict='bad'는 절대 긍정 근거로 안 쓴다 — 예전엔 status='visited'가 무조건
  // 긍정 취급이라, 별로였던 부스가 "너 여기 좋아했잖아"의 근거가 될 수 있었다
  // (judgment-vocabulary §1-2의 버그 수정).
  const boothById = new Map(rank.booths.map((b) => [b.id, b]));
  const positives = positiveNotes(notes)
    .map((n) => ({
      booth: boothById.get(n.boothId),
      kind: n.kind,
    }))
    .filter((p): p is { booth: Booth; kind: "must" | "curious" | "good" } =>
      Boolean(p.booth),
    );

  // 근거는 피드 하나당 최대 2번(createLinkPicker의 maxUses 기본값)만 말하고,
  // 매번 서로 다른 과거 반응 부스를 인용한다 — 여섯 장에 다 같은 근거를 붙이면
  // 라벨만 다르고 본문은 같던 예전 문제로 되돌아간다. "부스가 무엇인지 말할 수
  // 없는 카드엔 안 붙인다"는 예전 제약은 뺐다 — grounding.ts가 이제 부스명 폴백으로
  // 항상 사실을 말하므로(fact 없는 카드가 더는 없다), 근거 링크를 그 여부에 묶을
  // 이유가 없어졌다.
  const becauseOf = createLinkPicker(positives);

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
