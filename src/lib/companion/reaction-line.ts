// 판단 즉답 — 부스가 속한 관람 가치(interestSlugs) + 브레인 누적 확신도로 톤을 조절한다.
// 순수·LLM 없음.
//
// interest(must/curious)·verdict(good/bad)만 매칭을 탄다. curious는 판정 가중치가
// must의 절반이라(taste.ts judgmentScore) "확실히 좋아하는구나" 톤을 쓰면 신호보다
// 말이 앞선다. pass는 확신 매칭(confidence>=CONFIDENT_THRESHOLD)에서만 분야를
// 말하고, 그마저도 "안에서도 다는 아니다"로 헤지한다 — 부스 하나 뺀 걸 분야 전체
// 부정으로 말하면 과장이다.
//
// 매칭은 interestSlugs(= boothValueSlugs(booth), 가치 축 slug)로 한다 — brain.interests
// 는 거의 항상 이 축으로 쌓인다. 하지만 발화에 얹는 {theme}은 매칭된 노드의 라벨
// (가치 이름 — 발화 금지 대상)이 아니라 호출부가 넘기는 이 부스의 카테고리 이름
// (categoryLabel, 구체적 사실)이다 — 가치 이름은 발화에 절대 쓰지 않는다는 원칙을
// 매칭 축과 발화 축을 분리해서 지킨다.
//
// verdict='bad'가 가장 조심할 자리다. 부스를 깎지 않고 *내 예측이 빗나갔음*을
// 로미가 가져간다 — pass의 헤지 원칙을 그대로 잇는다.
import { CONFIDENT_THRESHOLD } from "@/lib/constants";
import type { InterestNode } from "@/lib/types";
import type { TFn } from "@/lib/i18n/resolve";

export type JudgmentKind = "interest" | "verdict";
export type JudgmentValue = "must" | "curious" | "pass" | "good" | "ok" | "bad";

const BASE_KEY: Record<JudgmentValue, string> = {
  must: "reactMust",
  curious: "reactCurious",
  pass: "reactPass",
  good: "reactGood",
  ok: "reactOk",
  bad: "reactBad",
};

export function buildJudgmentLine(
  kind: JudgmentKind,
  value: JudgmentValue,
  /** boothValueSlugs(booth) — 이 부스가 기여하는 가치 축 slug. brain.interests와
   *  같은 축이라 여기로만 매칭한다. */
  interestSlugs: string[],
  boothName: string | undefined,
  /** 발화에 얹을 구체적 분야 이름(카테고리) — 가치 이름이 아니다. 없으면(부스에
   *  카테고리가 없는 예외 상황) 매칭돼도 분야를 언급하지 않는다. */
  categoryLabel: string | undefined,
  interests: InterestNode[],
  t: TFn,
  /** verdict='good'|'bad'일 때 쓴다 — 직전에 interest가 must/curious였는지(예측이
   *  맞았는지/빗나갔는지). 호출부(judgment-bar)가 판단 직전 record에서 넘긴다. */
  opts?: { matchedPriorInterest?: boolean },
): string {
  if (value === "ok") {
    return line(BASE_KEY.ok, boothName, t);
  }

  // interests는 confidence 내림차순(distill.ts)이라 첫 매치가 곧 최고 확신 가치.
  const match = interests.find((n) => interestSlugs.includes(n.key));

  if (value === "must" || value === "curious") {
    if (!match || !categoryLabel) return line(BASE_KEY[value], boothName, t);
    const tier =
      match.confidence >= CONFIDENT_THRESHOLD
        ? `${BASE_KEY[value]}Confident`
        : `${BASE_KEY[value]}Tentative`;
    return line(tier, boothName, t, categoryLabel);
  }

  if (value === "pass") {
    if (match && match.confidence >= CONFIDENT_THRESHOLD && categoryLabel) {
      return line(`${BASE_KEY.pass}Confident`, boothName, t, categoryLabel);
    }
    return line(BASE_KEY.pass, boothName, t);
  }

  if (value === "good") {
    const key = opts?.matchedPriorInterest
      ? `${BASE_KEY.good}Matched`
      : BASE_KEY.good;
    return line(key, boothName, t);
  }

  // value === "bad" — 직전 interest가 must/curious였으면(예측이 있었다는 뜻)
  // 분야 매칭 여부와 무관하게 명시적 "배움" 톤이 가장 구체적인 근거다 — 브레인
  // 확신도 매칭(아래 Confident 분기)보다 우선한다. 부스를 깎지 않고 "내 예측이
  // 빗나갔다"로 로미가 가져가는 원칙은 그대로다.
  if (opts?.matchedPriorInterest) {
    return line("reactBadMissed", boothName, t);
  }
  if (match && match.confidence >= CONFIDENT_THRESHOLD && categoryLabel) {
    return line(`${BASE_KEY.bad}Confident`, boothName, t, categoryLabel);
  }
  return line(BASE_KEY.bad, boothName, t);
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
