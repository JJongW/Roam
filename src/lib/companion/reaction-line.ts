// 반응 즉답 — 부스가 속한 관람 가치(interestSlugs) + 브레인 누적 확신도로 톤을 조절한다.
// 순수·LLM 없음.
//
// interested/skip만 매칭을 탄다. later는 판정 가중치가 interested의 0.3배라(taste.ts
// judgmentScore) "확실히 좋아하는구나" 톤을 쓰면 신호보다 말이 앞선다. skip은 확신
// 매칭(confidence>=0.25)에서만 분야를 말하고, 그마저도 "안에서도 다는 아니다"로
// 헤지한다 — 부스 하나 뺀 걸 분야 전체 부정으로 말하면 과장이다(reaction-bar.tsx의
// 기존 교훈을 반복하지 않는다).
//
// 매칭은 interestSlugs(= boothValueSlugs(booth), 가치 축 slug)로 한다 — brain.interests
// 는 거의 항상 이 축으로 쌓인다(모든 부스가 valueTags를 최소 1개 갖도록 파생되므로
// booth.tags로는 사실상 매칭되지 않는다, service.ts/derive.ts 참고). 하지만 발화에
// 얹는 {theme}은 매칭된 노드의 라벨(가치 이름 — "가볍게" 등, 발화 금지 대상)이 아니라
// 호출부가 넘기는 이 부스의 카테고리 이름(categoryLabel, 구체적 사실)이다 — 가치
// 이름은 발화에 절대 쓰지 않는다는 원칙을 매칭 축과 발화 축을 분리해서 지킨다.
import type { InterestNode } from "@/lib/types";
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
  /** boothValueSlugs(booth) — 이 부스가 기여하는 가치 축 slug. brain.interests와
   *  같은 축이라 여기로만 매칭한다. */
  interestSlugs: string[],
  boothName: string | undefined,
  /** 발화에 얹을 구체적 분야 이름(카테고리) — 가치 이름이 아니다. 없으면(부스에
   *  카테고리가 없는 예외 상황) 매칭돼도 분야를 언급하지 않는다. */
  categoryLabel: string | undefined,
  interests: InterestNode[],
  t: TFn,
): string {
  if (key === "later" || key === "seen") {
    return line(BASE_KEY[key], boothName, t);
  }

  // interests는 confidence 내림차순(distill.ts)이라 첫 매치가 곧 최고 확신 가치.
  const match = interests.find((n) => interestSlugs.includes(n.key));

  if (key === "interested") {
    if (!match || !categoryLabel) return line(BASE_KEY.interested, boothName, t);
    const tier =
      match.confidence >= CONFIDENT_THRESHOLD
        ? "reactInterestedConfident"
        : "reactInterestedTentative";
    return line(tier, boothName, t, categoryLabel);
  }

  // key === "skip" — 확신 매칭에서만, 헤지된 문장으로.
  if (match && match.confidence >= CONFIDENT_THRESHOLD && categoryLabel) {
    return line("reactSkipConfident", boothName, t, categoryLabel);
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
