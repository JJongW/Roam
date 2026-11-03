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

/**
 * **사람이 반려하는 것들.** 사람 판단 787건으로 코드별 승인률을 세 보니 점수보다
 * 코드가 훨씬 잘 맞혔다 — 그래서 정책을 점수 우선에서 코드 우선으로 뒤집었다.
 *
 * ```
 * no_value_tags  0%   speculation 7%   no_interpretation 19%   not_found 22%
 * weak_sources  29%   no_sources 35%   generic_action 0%(n=2)
 * ```
 *
 * 이것들은 **사람에게 보내도 할 게 없다.** 근거가 없거나 글이 실패한 것이라
 * 검수자가 봐도 "다시 찾아"라고 적을 뿐이다. 기계가 다시 쓴다.
 */
const REDRAFT = new Set([
  // 글 자체가 실패 — 다시 물어보면 달라진다
  "duplicate_line",
  "name_only",
  "not_roam_voice",
  "generic_action",
  // 스키마가 어긋남 — 역시 다시 물어보면 고쳐진다
  "unknown_value_slug",
  "strength_out_of_range",
  "reason_without_tag",
  "too_many_value_tags",
  // 근거가 없음 — 사람이 봐도 웹에 없는 건 없다
  "no_sources",
  "weak_sources",
  "no_interpretation",
  "no_value_tags",
  "speculation",
  // 초안이 스스로 못 찾았다고 적음(2026-10-16 신설)
  "not_found",
]);

/**
 * **확인 불가지 품질 불량이 아니다.** 작은 한국 브랜드는 웹에 근거가 없는 게
 * 정상이라, 이 코드들이 붙은 초안도 사람은 대부분 승인했다.
 *
 * ```
 * value_word_in_voice 100%(n=2)   category_readback 90%   filler 89%
 * single_source 83%               unanchored 73%
 * ```
 *
 * 예전엔 `unanchored`·`no_sources`를 점수와 무관하게 전부 사람에게 보냈는데,
 * `unanchored` 274건 중 4분의 3을 사람이 그대로 승인했다. 그게 사람 몫 62%의
 * 최대 원인이었다. 이제 이것들만 붙었으면 바닥 점수 위에서 자동으로 보낸다 —
 * 대신 빈말 가중치를 제대로 매겨(0.06→0.25) 신원이 안 맞대진 것과 겹치면
 * 바닥 아래로 떨어지게 했다.
 */
const UNVERIFIABLE = new Set([
  "filler",
  "single_source",
  "unanchored",
  "category_readback",
  "value_word_in_voice",
]);

export interface PolicyConfig {
  /** 이 이상이면 자동 통과 후보. 운영 실측 근거는 위 표. */
  autoPassAt: number;
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
  autoPassAt: 0.6,
  shadow: false,
};

/**
 * 아직 믿을지 정하지 않은 전시에 쓰는 문턱. 초안 품질은 전시마다 다르다 —
 * 자동 승인분의 새어나감이 마곡리빙마켓은 9.9%인데 DDP·SIF·가구쇼는 0%였다.
 * 그래서 전시마다 앞부분을 사람이 보고, 그 결과로 문턱을 정한다(`exhibitionTrust`).
 */
export const STRICT_POLICY: PolicyConfig = { ...DEFAULT_POLICY, autoPassAt: 0.95 };

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

  // 1. 코드가 먼저다. 사람이 봐도 "다시 찾아"라고 쓸 것들은 기계에게 돌려보낸다.
  const redraft = [...codes].filter((c) => REDRAFT.has(c));
  if (redraft.length > 0) {
    return {
      decision: "redraft",
      reason: `사람이 봐도 할 게 없어요. 기계가 다시 써요(${redraft.join(", ")})`,
      wouldAutoPass: false,
    };
  }

  // 2. 남은 지적은 "확인 불가"뿐이다. 점수는 그 겹침의 정도를 재는 눈금으로만 쓴다.
  //    빈말 하나(0.75)는 통과하고, 빈말 + 신원 안 맞댐(0.65)은 못 넘는다.
  if (confidence >= config.autoPassAt) {
    return {
      decision: config.shadow ? "review" : "auto_pass",
      reason: config.shadow
        ? `자동 통과 대상(신뢰도 ${confidence.toFixed(2)}) — 그림자 모드라 사람이 봐요`
        : `신뢰도 ${confidence.toFixed(2)} — 자동 통과`,
      wouldAutoPass: true,
    };
  }

  const unverifiable = [...codes].filter((c) => UNVERIFIABLE.has(c));
  return {
    decision: "review",
    reason: unverifiable.length
      ? `확인 불가가 겹쳤어요(${unverifiable.join(", ")}) — 신뢰도 ${confidence.toFixed(2)}, 사람이 봐요`
      : `신뢰도 ${confidence.toFixed(2)} — 사람이 봐요`,
    wouldAutoPass: false,
  };
}

// ── 전시마다 믿을지 정한다 ─────────────────────────────────────────────────

/** 보정에 필요한 최소한만 받는다 — 저장소 타입을 끌어오지 않으려고. */
export interface TrustSample {
  confidence: number;
  issues: QualityIssue[];
  status: "pending" | "approved" | "rejected" | "superseded";
  /** 일괄 승인처럼 **사람이 안 본 것**은 보정 근거가 아니다. */
  reviewNote?: string | null;
  createdAt: string;
}

export interface ExhibitionTrust {
  phase: "sampling" | "trusted" | "strict";
  /** 표본 중 사람이 판단한 수. */
  sampled: number;
  approved: number;
  /** 이 전시에 쓸 설정. */
  policy: PolicyConfig;
  reason: string;
}

/** 이만큼은 사람이 봐야 그 전시를 믿을지 정한다. 590건짜리 전시에선 4%다. */
export const TRUST_SAMPLE = 25;
/** 표본 승인률이 이 아래면 그 전시는 계속 엄격하게 본다. */
export const TRUST_GATE = 0.9;

/**
 * **초안 품질은 전시마다 다르다.** 자동 승인분 중 사람이 반려했을 글의 비율이
 * 마곡리빙마켓은 9.9%인데 DDP·SIF·가구쇼·하우스아카이브는 0%였다 — 위험의 71%가
 * 전시 하나에 몰려 있었다. 전체를 조여서 풀 문제가 아니라 **그 전시를 알아보는**
 * 문제다.
 *
 * 그래서 전시마다 앞 `TRUST_SAMPLE`건을 사람이 보고 그 결과로 문턱을 정한다.
 * 표본은 **느슨한 정책에서 새로 자동 통과하게 된 것들**(0.70~0.95)이다 — 거기가
 * 위험이 사는 구간이라서다. 지적 없는 1.00짜리 228건은 전부 승인이었으니 표본에
 * 넣어 사람 시간을 쓸 이유가 없다.
 *
 * 상태를 따로 저장하지 않는다. `enrichment_candidate` 행에 이미 다 있다 —
 * 테이블을 더 만들면 그 테이블이 틀어졌을 때 아무도 모른다.
 */
export function exhibitionTrust(candidates: TrustSample[]): ExhibitionTrust {
  // 느슨한 정책에서만 자동 통과하는 것 = 이번에 새로 믿기로 한 구간.
  const risky = candidates
    .filter(
      (c) =>
        reviewPolicy(c.confidence, c.issues, DEFAULT_POLICY).decision === "auto_pass" &&
        reviewPolicy(c.confidence, c.issues, STRICT_POLICY).decision !== "auto_pass",
    )
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));

  const judged = risky.filter(
    (c) =>
      (c.status === "approved" || c.status === "rejected") &&
      !(c.reviewNote ?? "").startsWith("일괄 승인"),
  );
  const sample = judged.slice(0, TRUST_SAMPLE);
  const approved = sample.filter((c) => c.status === "approved").length;

  if (sample.length < TRUST_SAMPLE) {
    return {
      phase: "sampling",
      sampled: sample.length,
      approved,
      policy: STRICT_POLICY,
      reason: `아직 ${sample.length}/${TRUST_SAMPLE}건만 봤어요. 이 행사를 믿을지 정하는 중이에요`,
    };
  }

  const rate = approved / sample.length;
  if (rate >= TRUST_GATE) {
    return {
      phase: "trusted",
      sampled: sample.length,
      approved,
      policy: DEFAULT_POLICY,
      reason: `표본 ${sample.length}건 중 ${approved}건 승인(${Math.round(rate * 100)}%) — 나머지는 자동으로 보내요`,
    };
  }
  return {
    phase: "strict",
    sampled: sample.length,
    approved,
    policy: STRICT_POLICY,
    reason: `표본 승인률이 ${Math.round(rate * 100)}%예요. 이 행사 초안은 사람이 봐요`,
  };
}

// ── 몇 번까지 다시 쓰게 할 것인가 ──────────────────────────────────────────

/**
 * 기계가 같은 부스를 다시 쓰는 횟수의 상한.
 *
 * 재초안은 공짜가 아니다 — 초안 한 번이 검색 각도 3개 × 재시도 2번이라 Gemini
 * 호출이 최대 6회다. 그런데 **다시 물어봐도 웹에 없는 정보는 여전히 없다.**
 * 두 번 해서 안 되면 그건 모델이 운이 나빴던 게 아니라 근거가 없는 것이고,
 * 그때부터는 사람이 인스타를 뒤지는 게 유일한 길이다.
 *
 * 2회로 잡은 근거: 초안기는 한 번 돌 때 이미 세 각도를 시도하고 가장 좋은 것만
 * 남긴다. 그러니 2회면 실제로는 여섯 각도를 본 것이다.
 */
export const MAX_DRAFT_ROUNDS = 2;

/** 이 부스에 몇 번째 초안까지 나갔나. `superseded`도 한 번 쓴 것이라 센다. */
export function draftRounds(candidates: { boothId: string }[]): Map<string, number> {
  const rounds = new Map<string, number>();
  for (const c of candidates) rounds.set(c.boothId, (rounds.get(c.boothId) ?? 0) + 1);
  return rounds;
}

/**
 * **더 돌려도 소용없는 부스.** 상한만큼 썼는데 아직 재초안 판정이면 기계는 손을
 * 뗀다 — 여기부터는 사람이 직접 찾을 목록이다(화면의 "기계가 못 찾은 곳").
 *
 * 상한을 안 두면 같은 부스를 매 배치마다 다시 쓰면서 요금만 쌓인다. 실제로
 * `needsDraft`가 "저작 필드가 비었나"만 보기 때문에, 반려되거나 재초안으로
 * 빠진 부스는 다음 배치에서 **자동으로 다시 대상이 된다.**
 */
export function exhaustedBooths(
  candidates: { boothId: string; confidence: number; issues: QualityIssue[]; createdAt: string }[],
  max: number = MAX_DRAFT_ROUNDS,
): Set<string> {
  const rounds = draftRounds(candidates);
  const latest = new Map<string, (typeof candidates)[number]>();
  for (const c of [...candidates].sort((a, b) =>
    String(a.createdAt).localeCompare(String(b.createdAt)),
  )) {
    latest.set(c.boothId, c);
  }
  const out = new Set<string>();
  for (const [boothId, c] of latest) {
    if ((rounds.get(boothId) ?? 0) < max) continue;
    if (reviewPolicy(c.confidence, c.issues).decision === "redraft") out.add(boothId);
  }
  return out;
}
