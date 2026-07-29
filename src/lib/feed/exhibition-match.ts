// 전시 단위 취향 매칭 — 홈에서 "어떤 전시를 먼저 보여줄까"를 정한다. 순수·LLM 없음.
//
// 왜 가치(value) 축인가: 카테고리 slug는 전시마다 namespace가 다르다(SIBF lit/art,
// SIF kr-artist, HOUSE ARCHIVE collect). 그대로 매칭하면 전시 간 취향이 전혀 전이되지
// 않는다. 반면 브레인의 관심 축은 가치 slug다(memory/service.ts:41 "관심 축 = 가치
// slug(valueTags)")— 8종 공통이라 크로스-전시로 산다.
//
// 이 모듈은 "근거 없는 추천"을 막는 게 목적이다. 겹치는 가치가 없으면 추천이라고
// 부르지 않는다(matched=[] → 호출부가 뱃지·근거문장을 숨긴다).
import type { Booth, UserBrain } from "@/lib/types";
import { valueLabel } from "@/lib/values";

/** 한 전시가 어떤 가치를 얼마나 담고 있는지. slug → 0..1 비중. */
export type ExhibitionValueProfile = Record<string, number>;

/** 근거로 쓸 만한 관심으로 치는 최소 confidence. 이보다 낮으면 신호로 안 본다. */
const MIN_CONFIDENCE = 0.15;
/** 전시 프로필에서 "이 전시의 성격"이라 부를 최소 비중. */
const MIN_SHARE = 0.08;
/** 근거 문장에 넣을 최대 가치 수 — 길어지면 읽히지 않는다. */
const MAX_REASON_VALUES = 2;

/**
 * 전시의 부스들에서 가치 프로필을 만든다. 부스 valueTags의 가중 합을 정규화한 것.
 * 부스가 없거나 valueTags가 비면 빈 프로필({})이고, 그 전시는 매칭 대상이 아니다.
 */
export function exhibitionValueProfile(booths: Booth[]): ExhibitionValueProfile {
  const acc = new Map<string, number>();
  let total = 0;
  for (const b of booths) {
    // 편의시설(facility)은 관람 취향과 무관하니 뺀다 — 추천에서도 빠진다.
    if (b.kind === "facility") continue;
    for (const v of b.valueTags ?? []) {
      acc.set(v.slug, (acc.get(v.slug) ?? 0) + v.strength);
      total += v.strength;
    }
  }
  if (total <= 0) return {};
  const out: ExhibitionValueProfile = {};
  for (const [slug, sum] of acc) out[slug] = sum / total;
  return out;
}

export interface ExhibitionMatch {
  /** 0..1. 높을수록 이 사용자의 관심과 겹친다. 겹침이 없으면 0. */
  score: number;
  /** 실제로 겹친 가치 slug — 강한 순. 비면 "추천"이라 부르면 안 된다. */
  matched: string[];
}

/**
 * 브레인 관심 × 전시 가치 프로필. 겹친 가치만 점수에 들어간다.
 * 브레인이 없거나 관심이 약하면 score 0 · matched [] — 호출부가 폴백해야 한다.
 */
export function matchExhibition(
  brain: UserBrain | null,
  profile: ExhibitionValueProfile,
): ExhibitionMatch {
  if (!brain) return { score: 0, matched: [] };
  const scored: Array<[string, number]> = [];
  for (const node of brain.interests) {
    if (node.confidence < MIN_CONFIDENCE) continue;
    const share = profile[node.key];
    if (!share || share < MIN_SHARE) continue;
    scored.push([node.key, node.confidence * share]);
  }
  if (scored.length === 0) return { score: 0, matched: [] };
  scored.sort((a, b) => b[1] - a[1]);
  const total = scored.reduce((s, [, v]) => s + v, 0);
  return {
    // confidence·share 모두 0..1이라 곱의 합도 사실상 0..1 범위에 머문다.
    score: Math.min(1, total),
    matched: scored.map(([slug]) => slug),
  };
}

/**
 * 겹친 가치로 근거 한 줄을 만든다. 겹침이 없으면 null — 그때는 아무 말도 하지 않는다.
 * 예: "네가 고른 발견·영감과 겹치는 부스가 많아."
 */
export function matchReason(matched: string[]): string | null {
  if (matched.length === 0) return null;
  const labels = matched.slice(0, MAX_REASON_VALUES).map(valueLabel);
  return `네가 고른 ${labels.join("·")}과 겹치는 부스가 많아.`;
}

/**
 * 개막일 오름차순 — 취향 근거가 없을 때의 정직한 정렬. "곧 열리는 순"이라고 말할 수
 * 있는 순서이고, id 정렬처럼 아무 의미 없는 순서가 아니다.
 */
export function byStartDate<T extends { startDate: string }>(list: T[]): T[] {
  return [...list].sort((a, b) => a.startDate.localeCompare(b.startDate));
}
