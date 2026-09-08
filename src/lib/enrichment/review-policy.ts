import type { QualityIssue } from "./quality-gate";

/**
 * 초안 하나를 어떻게 다룰지 — 자동 통과 / 사람 검수 / 재조사.
 *
 * 부스 900개짜리 전시는 전수 검수가 불가능하다. 그렇다고 점수만으로 가를 수도
 * 없다 — 운영 실측(검수 30건)이 그걸 보여줬다.
 *
 * ```
 * 0.95~1.00  41/41 승인 (100%)  ← 여기만 완벽하다
 * 0.80~0.94  24/26 승인 (92%)
 * 0.60~0.79   3/5  승인 (60%)
 * <0.60       3/5  승인 (60%)   ← 하단에선 신호가 약하다
 * ```
 *
 * 검수 77건(SIF 66 + 하우스 아카이브 11)을 근거로 임계를 **0.95**로 잡았다.
 * 0.80으로 두면 66건이 자동 반영되고 그중 1건이 사람이 반려했을 글이다(2%).
 * 0.95면 41건이 전부 안전하다 — 자동으로 빠지는 양이 줄어드는 대신 **새어나가는
 * 글이 없다.** 지어낸 사실은 나중에 되돌려도 이미 사용자가 읽은 뒤다.
 *
 * **낮은 점수가 "품질 나쁨"이 아니라 "확인 불가"인 경우가 많았다.** 승인된 것들이
 * 받은 지적이 `no_sources` 8건, `filler` 9건이다 — 작은 한국 브랜드는 웹에 근거가
 * 없는 게 정상이다. 그래서 `<0.60`을 통째로 재조사로 돌리면 사람이 승인했을 초안의
 * 75%를 버리고 Gemini 요금만 두 배가 된다.
 *
 * 재조사는 **다시 물어보면 고쳐질 종류**에만 보낸다.
 */

export type ReviewDecision = "auto_pass" | "review" | "redraft";

/** 글 자체가 실패한 것 — 다시 물어보면 달라질 수 있다. */
const DEFECT = new Set([
  "duplicate_line", // 다른 부스와 같은 문장 = 템플릿 되풀이
  "name_only", // 부스명만 되풀이 = 정보 없음
  "not_roam_voice", // 존댓말·자기소개 어투 = 화자가 뒤집힘
  "value_word_in_voice", // 분류를 되읽어줌
  "generic_action", // 다른 부스에도 그대로 쓰이는 행동
]);

/** 스키마가 어긋난 것 — 역시 다시 물어보면 고쳐진다. */
const SCHEMA = new Set([
  "unknown_value_slug",
  "strength_out_of_range",
  "reason_without_tag",
  "too_many_value_tags",
]);

/**
 * 근거를 못 찾았다는 뜻이지 글이 나쁘다는 뜻이 아니다. 다시 물어봐도 웹에 없는
 * 정보는 여전히 없다 — 재조사가 아니라 사람에게 보낸다.
 */
const UNVERIFIABLE = new Set(["no_sources", "no_interpretation", "no_value_tags"]);

/**
 * 출처가 없으면 **점수가 아무리 높아도 자동 통과시키지 않는다.**
 *
 * 게이트는 글의 형식을 보지 사실 여부를 못 본다 — 웹에 없는 걸 검증할 방법이
 * 없기 때문이다. 실제로 검수자가 `B06 위니빌리지`(0.85)를 반려하며 이렇게 적었다:
 * *"다시 잘 찾아볼 것, 거짓정보만큼 위험한 게 없음."*
 *
 * 지어낸 사실은 나중에 되돌려도 이미 사용자가 읽은 뒤다. 확인된 근거가 있는 글만
 * 사람 없이 내보낸다.
 */
/**
 * `unanchored`가 여기 있는 이유(2026-09-08): 점수는 형식을 본다. 브랜드가 통째로
 * 바뀌어도 형식은 완벽할 수 있다 — homedepot·ebay의 미국 에어프라이어 "Aria"를
 * 한국 부스 '아리아'로 쓴 초안이 1.00을 받고 운영에 반영됐다. 임계를 0.95에서
 * 더 올려도 이건 못 막는다. **확인된 주소에 근거가 닿은 것만** 사람 없이 내보낸다.
 */
const NEVER_AUTO = new Set(["no_sources", "unanchored"]);

export interface PolicyConfig {
  /** 이 이상이면 자동 통과 후보. 운영 실측 근거는 위 표. */
  autoPassAt: number;
  /** 이 아래면 **사람에게 안 보낸다** — 초안기가 다시 찾는다.
   *  낮은 점수를 사람 큐에 쌓으면 검수자가 "근거가 없다"는 사실만 반복해서
   *  확인하게 된다. 다시 찾는 건 기계가 할 일이다. */
  redraftBelow: number;
  /** 그림자 모드 — 자동 통과를 **표시만** 하고 실제로는 반영하지 않는다. */
  shadow: boolean;
}

/**
 * **그림자 모드를 껐다(2026-09-07).** 검수 77건으로 되짚어보니 0.95 이상 + 근거
 * 있음 조건에서 자동 반영 41건 중 사람이 반려했을 글이 **0건**이었다. 그림자로
 * 한 번 더 확인하는 단계는 그 숫자로 끝났다.
 *
 * 되돌리려면 `shadow: true`만 바꾸면 된다 — 이미 반영된 것은 change_log에
 * "자동 통과"로 남아 있어 찾아서 되돌릴 수 있다.
 */
export const DEFAULT_POLICY: PolicyConfig = {
  autoPassAt: 0.95,
  redraftBelow: 0.6,
  shadow: false,
};

export interface PolicyResult {
  decision: ReviewDecision;
  /** 사람이 읽을 이유. 화면에 그대로 뜬다. */
  reason: string;
  /** 그림자 모드가 아니었다면 자동 통과했을 건가. 보정 근거를 모으는 데 쓴다. */
  wouldAutoPass: boolean;
}

export function reviewPolicy(
  confidence: number,
  issues: QualityIssue[],
  config: PolicyConfig = DEFAULT_POLICY,
): PolicyResult {
  const codes = new Set(issues.map((i) => i.code));
  const defects = [...codes].filter((c) => DEFECT.has(c) || SCHEMA.has(c));

  if (defects.length > 0) {
    return {
      decision: "redraft",
      reason: `다시 물어보면 고쳐질 문제다(${defects.join("·")})`,
      wouldAutoPass: false,
    };
  }

  const blocked = [...codes].filter((c) => NEVER_AUTO.has(c));
  if (blocked.length > 0) {
    return {
      decision: "review",
      reason: `근거가 확인되지 않았다 — 점수와 무관하게 사람이 본다(${blocked.join("·")})`,
      wouldAutoPass: false,
    };
  }

  const passes = confidence >= config.autoPassAt;
  if (passes) {
    return {
      decision: config.shadow ? "review" : "auto_pass",
      reason: config.shadow
        ? `자동 통과 대상(신뢰도 ${confidence.toFixed(2)}) — 그림자 모드라 사람이 본다`
        : `신뢰도 ${confidence.toFixed(2)} — 자동 통과`,
      wouldAutoPass: true,
    };
  }

  // 0.60 아래는 사람에게 올리지 않는다. 근거를 못 찾은 글을 검수자가 봐도
  // 할 수 있는 게 없다 — 다시 찾아오는 게 맞다.
  if (confidence < config.redraftBelow) {
    return {
      decision: "redraft",
      reason: `신뢰도 ${confidence.toFixed(2)} — 사람에게 올리기 전에 다시 찾는다`,
      wouldAutoPass: false,
    };
  }

  const unverifiable = [...codes].filter((c) => UNVERIFIABLE.has(c));
  return {
    decision: "review",
    reason: unverifiable.length
      ? `근거를 못 찾았을 뿐 글이 나쁘다는 뜻은 아니다(${unverifiable.join("·")}) — 사람이 본다`
      : `신뢰도 ${confidence.toFixed(2)} — 사람이 본다`,
    wouldAutoPass: false,
  };
}
