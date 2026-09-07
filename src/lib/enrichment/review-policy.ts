import type { QualityIssue } from "./quality-gate";

/**
 * 초안 하나를 어떻게 다룰지 — 자동 통과 / 사람 검수 / 재조사.
 *
 * 부스 900개짜리 전시는 전수 검수가 불가능하다. 그렇다고 점수만으로 가를 수도
 * 없다 — 운영 실측(검수 30건)이 그걸 보여줬다.
 *
 * ```
 * ≥0.80      22/23 승인 (96%)   ← 상단에선 점수가 잘 맞는다
 * 0.60~0.79   3/3  승인
 * <0.60       3/4  승인 (75%)   ← 하단에선 신호가 약하다
 * ```
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

export interface PolicyConfig {
  /** 이 이상이면 자동 통과 후보. 운영 실측 근거는 위 표. */
  autoPassAt: number;
  /** 그림자 모드 — 자동 통과를 **표시만** 하고 실제로는 반영하지 않는다. */
  shadow: boolean;
}

export const DEFAULT_POLICY: PolicyConfig = { autoPassAt: 0.8, shadow: true };

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

  const unverifiable = [...codes].filter((c) => UNVERIFIABLE.has(c));
  return {
    decision: "review",
    reason: unverifiable.length
      ? `근거를 못 찾았을 뿐 글이 나쁘다는 뜻은 아니다(${unverifiable.join("·")}) — 사람이 본다`
      : `신뢰도 ${confidence.toFixed(2)} — 사람이 본다`,
    wouldAutoPass: false,
  };
}
