// 근거 카드 — "무엇 / 왜 너에게 맞음 / 무슨 근거 / 얼마나 확실" 을 부스에서 뽑는다.
// 정보 전달이 아니라 사용자가 스스로 판단할 재료(companion-reframe §근거카드). 순수·LLM 없음.
//
// 로미의 한 줄은 두 절이다: **이 부스가 무엇인지(사실)** + **왜 지금 너한테(내 행동)**.
// 예전엔 두 번째 절을 가치 이름으로 말했다("발견 쪽 부스야", "네 관심 가치랑 겹쳐").
// 현장에서 그 말은 정보가 아니다 — 온보딩에서 고른 단어를 되읽어줄 뿐이고, 부스가
// 뭘 하는 곳인지는 끝내 안 알려준다. 지금은 가치 이름을 아예 쓰지 않는다.
// 둘 다 없으면 한 줄을 비운다(빈말 금지).
import { boothValueSlugs } from "@/lib/values";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config";
import { DICTS } from "@/lib/i18n/dictionaries";
import { makeT } from "@/lib/i18n/resolve";
import type { Booth } from "@/lib/types";

export interface Grounding {
  /** 무엇 — 한 줄 소개. */
  what: string | null;
  /** 왜 너에게 맞을 수 있는지(판단 근거). 말할 게 없으면 빈 문자열. */
  why: string;
  /** 근거 조각 — 굿즈/현장 팁 등 확인 가능한 사실. */
  evidence: string[];
  /** 여기서 뭘 하면 좋은지(행동 제안). 저작 thingsToDo 있으면 노출. */
  todo: string[];
  /** 데이터 신뢰도 — enrichment 완성도로 파생. */
  confidence: "low" | "medium" | "high";
}

function firstClause(text: string, max = 46): string {
  const cut = text.split(/[.。\n·]/)[0]?.trim() ?? text.trim();
  return cut.length > max ? `${cut.slice(0, max)}…` : cut;
}

/**
 * 부스 요약을 발화에 얹을 한 조각으로. firstClause와 달리 중점(·)에서 자르지 않는다
 * (요약은 "A·B·C" 나열이 흔해 ·에서 끊으면 정보가 날아간다). 문장부호에서만 첫 문장.
 */
function summaryClause(text: string, max = 44): string {
  const cut = text.split(/[.。\n]/)[0]?.trim() ?? text.trim();
  return cut.length > max ? `${cut.slice(0, max)}…` : cut;
}

/**
 * 부스 + 사용자 상위 관심 가치(slug)로 근거 카드를 만든다.
 */
export function buildGrounding(
  booth: Booth,
  userValueSlugs: string[],
  locale: Locale = DEFAULT_LOCALE,
  /** 이 부스를 꺼낸 계기가 된 내 지난 반응 — 근거를 가치 이름이 아니라 내 행동으로 말한다. */
  because?: { name: string; kind: "must" | "curious" | "good" },
): Grounding {
  const t = makeT(DICTS[locale]);
  const e = booth.enrichment;
  const boothVals = boothValueSlugs(booth);
  const overlap = boothVals.filter((v) => userValueSlugs.includes(v));

  // 1절 = 이 부스가 무엇인지(사실). 저작 한 줄 > 가치별 저작 근거 > 공식 소개 한 조각.
  // 가치 이름("발견 쪽 부스야")은 쓰지 않는다 — 현장에서 그 말은 아무 정보가 아니고,
  // 사용자가 온보딩에서 고른 단어를 되읽어줄 뿐이다.
  const matchedReasons = overlap
    .map((v) => e?.recommendationReasons?.[v])
    .filter((r): r is string => Boolean(r));
  const fact =
    e?.roamInterpretation ??
    (matchedReasons.length > 0
      ? matchedReasons.slice(0, 2).join(" ")
      : e?.summary
        ? summaryClause(e.summary, 70)
        : e?.goodsKeywords?.[0]
          ? t("grounding.whatGoods", { goods: e.goodsKeywords[0] })
          : null);

  // 2절 = 왜 지금 너한테. 근거는 내가 실제로 누른 부스다. 없으면 붙이지 않는다 —
  // 억지로 채우면 "둘러보면 취향이 더 또렷해질 거야" 같은 빈말이 된다.
  // must·curious는 관람 전 긍정 의사(예전 status='interested')로 묶이고,
  // good은 현장에서 확인된 긍정(예전 status='visited')이다 — 문구는 그대로,
  // 매핑되는 조건만 새 어휘로 바뀐다.
  const link = because
    ? t(
        because.kind === "good"
          ? "grounding.becauseVisited"
          : "grounding.becauseInterested",
        { booth: because.name },
      )
    : null;

  // 말할 사실도 근거도 없으면 한 줄을 비운다(카드가 부스 정보만 보여준다).
  const why = [fact, link].filter(Boolean).join(" ");

  // 근거 — 확인 가능한 사실(굿즈 우선, 없으면 팁 한 조각).
  const evidence: string[] = [];
  if (e?.goodsKeywords?.length) evidence.push(...e.goodsKeywords.slice(0, 3));
  else if (e?.tips) evidence.push(firstClause(e.tips));

  const todo = e?.thingsToDo?.slice(0, 3) ?? [];

  // 신뢰도 — 저작 재료(해석·가치별근거·행동)까지 있으면 high. 기본 정보만이면 낮음.
  const authored = [
    e?.roamInterpretation || matchedReasons.length > 0,
    (e?.valueTags?.length ?? 0) > 0,
    todo.length > 0,
  ].filter(Boolean).length;
  const basic = [e?.summary, e?.goodsKeywords?.length, e?.tips].filter(
    Boolean,
  ).length;
  const confidence =
    authored >= 2 ? "high" : authored >= 1 || basic >= 2 ? "medium" : "low";

  return {
    what: e?.summary ?? booth.company ?? null,
    why,
    evidence,
    todo,
    confidence,
  };
}
