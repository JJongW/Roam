// 근거 카드 — "무엇 / 왜 너에게 맞음 / 무슨 근거 / 얼마나 확실" 을 부스에서 뽑는다.
// 정보 전달이 아니라 사용자가 스스로 판단할 재료(companion-reframe §근거카드). 순수·LLM 없음.
// v1: 저작 roamInterpretation 데이터가 아직 0%라, 왜맞음은 사용자 가치 ∩ 부스 가치 겹침으로
// 런타임 생성(더 정직 — 실제 매칭 신호를 그대로 보여준다). 저작 데이터가 차면 우선 채택.
import { boothValueSlugs } from "@/lib/values";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config";
import { DICTS } from "@/lib/i18n/dictionaries";
import { makeT } from "@/lib/i18n/resolve";
import type { Booth } from "@/lib/types";

type PickKind = "stable" | "unfamiliar" | "adventure";

export interface Grounding {
  /** 무엇 — 한 줄 소개. */
  what: string | null;
  /** 왜 너에게 맞을 수 있는지(판단 근거). 항상 한 줄 생성. */
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
 * 부스 + 사용자 상위 관심 가치(slug)로 근거 카드를 만든다. pick 갈래에 따라 왜맞음 톤이
 * 달라진다(안정=겹침 강조, 낯선/모험=새로 넓히기).
 */
export function buildGrounding(
  booth: Booth,
  userValueSlugs: string[],
  pick: PickKind,
  locale: Locale = DEFAULT_LOCALE,
): Grounding {
  const t = makeT(DICTS[locale]);
  const vl = (slug: string) => t(`values.${slug}`);
  const e = booth.enrichment;
  const boothVals = boothValueSlugs(booth);
  const overlap = boothVals.filter((v) => userValueSlugs.includes(v));

  // 왜 맞음 — 저작 데이터 최우선: 사용자 관심 가치에 대한 추천 근거 > 한 줄 해석 > 런타임 겹침.
  // (저작 recommendationReasons·roamInterpretation은 한국어 데이터라 미번역, 겹침 문장만 로케일.)
  let why: string;
  const matchedReasons = overlap
    .map((v) => e?.recommendationReasons?.[v])
    .filter((r): r is string => Boolean(r));
  if (matchedReasons.length > 0) {
    why = matchedReasons.slice(0, 2).join(" ");
  } else if (e?.roamInterpretation) {
    why = e.roamInterpretation;
  } else {
    // 저작 없음 — 매 카드가 같은 말이 되지 않게, 부스의 구체(summary 한 조각)를 주어로
    // 삼고 매칭 이유를 붙인다. summary 있는 부스는 부스마다 다른 문장이 된다(지어내기 없음).
    let reason: string;
    if (overlap.length > 0) {
      reason = t("grounding.whyOverlap", {
        values: overlap.slice(0, 2).map(vl).join("·"),
      });
    } else if (boothVals.length > 0) {
      const lead = vl(boothVals[0]);
      reason =
        pick === "stable"
          ? t("grounding.whyLeadStable", { lead })
          : t("grounding.whyLeadNew", { lead });
    } else {
      reason = t("grounding.whyNone");
    }
    // 구체 근거를 주어로 — summary 한 조각 우선, 없으면 굿즈 키워드를 로미 목소리로.
    // (둘 다 없으면 매칭 이유만. 지어내지 않음.)
    const whatClause = e?.summary
      ? summaryClause(e.summary, 44)
      : e?.goodsKeywords?.[0]
        ? t("grounding.whatGoods", { goods: e.goodsKeywords[0] })
        : null;
    why = whatClause
      ? t("grounding.whyComposed", { what: whatClause, reason })
      : reason;
  }

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
