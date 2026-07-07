// L4 메모리 → 추천 주입. 순수·결정론. 누적 관심(브레인)을 현재 세션 interests에
// 합쳐 랭킹에 반영한다("쓸수록 좋아짐"). 추가만 — 빈 브레인이면 base 그대로.
import type { UserBrain } from "@/lib/types";

export interface MergeInterestsOptions {
  /** 이 confidence 이상인 브레인 관심만 주입(약한 관심 노이즈 차단). */
  minConfidence?: number;
  /** 주입할 최대 슬러그 수(과도 희석 방지). */
  max?: number;
}

/**
 * 세션 interests(category slug)에 브레인 상위 관심을 합집합.
 * base 우선·중복 제거. 순서: base 먼저, 그다음 confidence 높은 브레인 관심.
 */
export function mergeBrainInterests(
  base: string[],
  brain: UserBrain,
  opts: MergeInterestsOptions = {},
): string[] {
  const minConfidence = opts.minConfidence ?? 0.25;
  const max = opts.max ?? 5;

  const fromBrain = brain.interests
    .filter((n) => n.confidence >= minConfidence)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, max)
    .map((n) => n.key);

  const out: string[] = [];
  const seen = new Set<string>();
  for (const slug of [...base, ...fromBrain]) {
    if (seen.has(slug)) continue;
    seen.add(slug);
    out.push(slug);
  }
  return out;
}
