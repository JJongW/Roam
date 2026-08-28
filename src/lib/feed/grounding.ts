// 근거 카드 — "무엇 / 왜 너에게 맞음 / 무슨 근거 / 얼마나 확실" 을 부스에서 뽑는다.
// 정보 전달이 아니라 사용자가 스스로 판단할 재료(companion-reframe §근거카드). 순수·LLM 없음.
//
// 로미의 한 줄은 두 절이다: **이 부스가 무엇인지(사실)** + **왜 지금 너한테(근거)**.
//
// 두 절은 재료가 다르다. 1절은 부스에 붙은 고정 사실(roamInterpretation·공식 소개)이라
// 누가 봐도 같고, 2절은 사람마다 달라진다 — 내가 실제로 누른 부스가 있으면 그걸로,
// 없으면 내 관심 가치와 겹치는 저작 근거(recommendationReasons)로 채운다.
// 예전엔 roamInterpretation과 recommendationReasons를 **같은 1절 자리에서 경쟁**시켰다.
// roamInterpretation이 항상 먼저 걸려 recommendationReasons는 도달 불가능한 분기였고,
// 가치별로 저작한 문장이 한 번도 사용자에게 닿지 않았다(감사 발견 1). 둘은 답하는
// 질문이 다르므로 경쟁시킬 이유가 없다 — 1절은 "무엇", 2절은 "왜 너한테".
// 예전엔 두 번째 절을 가치 이름으로 말했다("발견 쪽 부스야", "네 관심 가치랑 겹쳐").
// 현장에서 그 말은 정보가 아니다 — 온보딩에서 고른 단어를 되읽어줄 뿐이고, 부스가
// 뭘 하는 곳인지는 끝내 안 알려준다. 지금은 가치 이름을 아예 쓰지 않는다.
// 1절(사실)은 저작·공식 정보가 없어도 부스명으로 최소한을 말한다 — 부스가 뭔지
// 말 못 하는 침묵 카드를 만들지 않는다. 2절(근거)은 여전히 내가 실제로 반응한
// 부스와 가치가 겹칠 때만 붙는다 — 없는 근거를 지어내진 않는다.
import { boothAbout } from "@/lib/booth/about";
import { isSomeoneElsesVoice } from "@/lib/booth/voice";
import { boothValueSlugs } from "@/lib/values";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config";
import { DICTS } from "@/lib/i18n/dictionaries";
import { makeT } from "@/lib/i18n/resolve";
import type { Booth } from "@/lib/types";

export interface Grounding {
  /** 무엇 — 한 줄 소개. */
  what: string | null;
  /** 왜 너에게 맞을 수 있는지(판단 근거). 사실 절은 부스명 폴백으로 항상 채워지고,
   *  근거 절(내가 실제로 반응한 부스)만 없을 수 있다 — 빈 문자열이 되진 않는다. */
  why: string;
  /** 부스 당사자가 쓴 소개 — 로미 말로 고치지 않고 출처를 밝혀 그대로 인용한다.
   *  로미의 사실 절(`why`)에는 절대 섞지 않는다(booth/voice.ts). */
  quote: string | null;
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

  // 요약의 화자가 부스 당사자면(작가 자기소개·존댓말·판매 홍보) 로미의 사실 절로
  // 쓰지 않는다 — 쓰면 로미 자리에서 남이 1인칭 존댓말로 말하게 된다. 대신 출처를
  // 밝혀 인용한다(quote). 감사: docs/qa/2026-08-15_grounding-audit.md 발견 2.
  const summaryIsTheirs = isSomeoneElsesVoice(e?.summary);
  // 인용은 **요약이 실제로 1절에서 밀려났을 때만** 보여준다. 저작 해석이 있으면 요약은
  // 애초에 1절 후보가 아니었으니 인용할 이유가 없다 — 하우스 아카이브처럼 주최 측이 쓴
  // 존댓말 소개를 "부스가 직접 쓴 소개"로 잘못 붙이는 것도 여기서 막힌다.
  const quotable =
    summaryIsTheirs && !e?.roamInterpretation ? (e?.summary?.trim() ?? null) : null;

  // 1절 = 이 부스가 무엇인지(사실). 저작 한 줄 > 공식 소개 한 조각 >
  // 테마·굿즈에서 파생한 로미 한 줄 > 굿즈 > 부스명.
  // 가치별 저작 근거(recommendationReasons)는 여기 오지 않는다 — 2절 재료다.
  // 가치 이름("발견 쪽 부스야")은 쓰지 않는다 — 현장에서 그 말은 아무 정보가 아니고,
  // 사용자가 온보딩에서 고른 단어를 되읽어줄 뿐이다.
  const matchedReasons = overlap
    .map((v) => e?.recommendationReasons?.[v])
    .filter((r): r is string => Boolean(r));
  // 요약을 인용으로 내려보낸 부스는 사실 절이 부스명까지 떨어질 뻔한다. 그 전에
  // boothAbout의 파생 한 줄(테마 + 굿즈 개수)을 쓴다 — 이미 부스 상세가 쓰는 재료라
  // 새로 지어내는 게 아니고, "‘{이름}’ 부스야"보다 실제로 정보가 있다.
  const derived = boothAbout(booth).romi;
  // 사실 절이 어디서 왔는지를 함께 들고 다닌다 — 신뢰도 배지는 "필드가 몇 개 찼나"가
  // 아니라 "사용자가 지금 읽는 문장이 어디서 왔나"로 정해져야 한다(아래 confidence).
  let factSource: "authored" | "official" | "derived" | "name";
  let fact: string;
  if (e?.roamInterpretation) {
    factSource = "authored";
    fact = e.roamInterpretation;
  } else if (e?.summary && !summaryIsTheirs) {
    factSource = "official";
    fact = summaryClause(e.summary, 70);
  } else if (derived) {
    factSource = "derived";
    fact = derived;
  } else if (e?.goodsKeywords?.[0]) {
    factSource = "derived";
    fact = t("grounding.whatGoods", { goods: e.goodsKeywords[0] });
  } else {
    factSource = "name";
    fact = t("grounding.whatCompanyFallback", { name: booth.name });
  }

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
    : // 내가 누른 부스가 없으면 겹치는 가치의 저작 근거로 2절을 채운다. overlap은
      // valueTags 강도 순이라 [0]이 가장 강하게 겹치는 가치다. 한 개만 쓴다 —
      // 두 개를 이으면 한 호흡 규칙이 깨진다(브랜드북 §1-2).
      (matchedReasons[0] ?? null);

  // fact는 부스명 폴백까지 있어 항상 값이 있다 — link(근거)만 없을 수 있고, 그때는
  // 사실 절 하나만 남는다(한 줄 전체가 비는 경우는 이제 없다).
  const why = [fact, link].filter(Boolean).join(" ");

  // 근거 — 확인 가능한 사실(굿즈 우선, 없으면 팁 한 조각).
  const evidence: string[] = [];
  if (e?.goodsKeywords?.length) evidence.push(...e.goodsKeywords.slice(0, 3));
  else if (e?.tips) evidence.push(firstClause(e.tips));

  const todo = e?.thingsToDo?.slice(0, 3) ?? [];

  // 신뢰도 — **사용자가 지금 읽는 문장이 어디서 왔는지**로 정한다.
  //
  // 예전엔 enrichment 필드 개수를 셌다. 그래서 (a) 로미가 자기 말로 해석해준 부스와
  // 굿즈 목록만 있는 부스가 같은 "근거 보통" 배지를 달았고, (b) 요약이 인용으로
  // 밀려나 로미가 부스명만 말하는데도 그 요약이 점수에 계속 잡혀 배지가 실제보다
  // 높게 나왔다. 배지는 카드에 안 보이는 필드가 아니라 보이는 문장을 설명해야 한다.
  const authoredExtras = [
    matchedReasons.length > 0,
    (e?.valueTags?.length ?? 0) > 0,
    todo.length > 0,
  ].filter(Boolean).length;
  const wellAuthored =
    (factSource === "authored" && authoredExtras >= 1) ||
    // 공식 소개가 1절이어도 저작 재료가 두 겹이면(가치별 근거·수동 가치태그·행동 제안)
    // 카드에 실제로 저작된 내용이 실린다.
    (factSource === "official" && authoredExtras >= 2);
  const confidence = wellAuthored
    ? "high"
    : factSource === "authored" ||
        (factSource === "official" &&
          (authoredExtras >= 1 || evidence.length > 0))
      ? "medium"
      : // 파생·부스명 폴백은 로미가 부스를 설명한 게 아니다. 인용이 붙어 있어도
        // 그건 남의 말이라 근거로 세지 않는다.
        "low";

  return {
    // what은 카드 헤더가 아니라 보조 정보다. 인용으로 내려보낸 요약이라도
    // "이 부스가 무엇인가"의 답으로는 여전히 유효하다.
    what: e?.summary ?? booth.company ?? null,
    why,
    quote: quotable,
    evidence,
    todo,
    confidence,
  };
}
