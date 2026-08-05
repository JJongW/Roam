// 반응 즉답 — 부스 분야(booth.tags) + 브레인 누적 확신도로 톤을 조절한다. 순수·LLM 없음.
//
// interested/skip만 분야 매칭을 탄다. later는 판정 가중치가 interested의 0.3배라
// (taste.ts judgmentScore) "확실히 좋아하는구나" 톤을 쓰면 신호보다 말이 앞선다.
// skip은 확신 분야(confidence>=0.25)에서만 분야를 말하고, 그마저도 "안에서도 다는
// 아니다"로 헤지한다 — 부스 하나 뺀 걸 분야 전체 부정으로 말하면 과장이다
// (reaction-bar.tsx의 기존 교훈을 분야 축에서도 반복하지 않는다).
//
// 추상 가치 이름(발견·경험·휴식…)은 절대 말하지 않는다 — booth.tags(카테고리 slug,
// 항상 채워짐)로만 매칭한다. enrichment.themeTags/valueTags(저작 필드, 커버리지
// 16~66%)는 안 쓴다.
import type { Booth, InterestNode } from "@/lib/types";
import type { TFn } from "@/lib/i18n/resolve";

export type ReactionKey = "interested" | "later" | "skip" | "seen";

/** curate.ts·taste.ts와 같은 확신 임계값. */
const CONFIDENT_THRESHOLD = 0.25;

const BASE_KEY: Record<ReactionKey, string> = {
  interested: "reactInterested",
  later: "reactLater",
  skip: "reactSkip",
  seen: "reactSeen",
};

export function buildReactionLine(
  key: ReactionKey,
  booth: Pick<Booth, "tags">,
  boothName: string | undefined,
  interests: InterestNode[],
  t: TFn,
): string {
  if (key === "later" || key === "seen") {
    return line(BASE_KEY[key], boothName, t);
  }

  // interests는 confidence 내림차순(distill.ts)이라 첫 매치가 곧 최고 확신 분야.
  const match = interests.find((n) => booth.tags.includes(n.key));

  if (key === "interested") {
    if (!match) return line(BASE_KEY.interested, boothName, t);
    const tier =
      match.confidence >= CONFIDENT_THRESHOLD
        ? "reactInterestedConfident"
        : "reactInterestedTentative";
    return line(tier, boothName, t, match.label);
  }

  // key === "skip" — 확신 분야에서만, 헤지된 문장으로.
  if (match && match.confidence >= CONFIDENT_THRESHOLD) {
    return line("reactSkipConfident", boothName, t, match.label);
  }
  return line(BASE_KEY.skip, boothName, t);
}

function line(
  baseKey: string,
  boothName: string | undefined,
  t: TFn,
  theme?: string,
): string {
  const key = boothName ? baseKey : `${baseKey}Plain`;
  const params: Record<string, string> = {};
  if (boothName) params.booth = boothName;
  if (theme) params.theme = theme;
  return t(`companion.${key}`, params);
}
