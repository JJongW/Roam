import type { EnrichmentCandidate } from "@/lib/types";

/**
 * 신뢰도 밴드별 승인률 — **자동 통과 임계값을 정하는 유일한 근거**다.
 *
 * 설계 문서 §7이 "첫 전시는 임계값 1.0(전부 사람)으로 시작해 통과율이 안정되면
 * 내린다"고 한 그 통과율이 이것이다. 감으로 0.8을 정하는 것과, 0.8 위에서 96%가
 * 승인됐다는 걸 보고 정하는 것은 다르다.
 *
 * ⚠️ **전시가 바뀌면 분포도 바뀐다.** 저작 데이터가 풍부한 전시와 빈 전시는 초안
 * 품질이 다르고, 그래서 이 표는 전시별로도 볼 수 있어야 한다.
 */

export interface CalibrationBand {
  label: string;
  from: number;
  to: number;
  approved: number;
  rejected: number;
  /** 0..100. 판단된 게 없으면 null. */
  approvalPct: number | null;
}

export interface Calibration {
  bands: CalibrationBand[];
  reviewed: number;
  /** 이 표를 근거로 쓸 만한가. 표본이 적으면 임계값을 내리면 안 된다. */
  note: string | null;
}

const BANDS: [number, number, string][] = [
  [0.8, 1.01, "≥0.80"],
  [0.6, 0.8, "0.60~0.79"],
  [0, 0.6, "<0.60"],
];

/** 밴드 하나를 근거로 쓰려면 최소 이만큼은 판단돼 있어야 한다. */
const MIN_BAND_SAMPLE = 20;

export function calibration(candidates: EnrichmentCandidate[]): Calibration {
  // superseded·pending은 사람이 판단한 게 아니라 근거가 아니다.
  const reviewed = candidates.filter(
    (c) => c.status === "approved" || c.status === "rejected",
  );
  const bands = BANDS.map(([from, to, label]) => {
    const inBand = reviewed.filter((c) => c.confidence >= from && c.confidence < to);
    const approved = inBand.filter((c) => c.status === "approved").length;
    const rejected = inBand.length - approved;
    return {
      label,
      from,
      to,
      approved,
      rejected,
      approvalPct: inBand.length
        ? Math.round((approved / inBand.length) * 100)
        : null,
    };
  });

  return { bands, reviewed: reviewed.length, note: noteFor(bands) };
}

function noteFor(bands: CalibrationBand[]): string | null {
  const top = bands[0];
  const n = top.approved + top.rejected;
  if (n === 0) {
    return "아직 판단된 초안이 없다 — 자동 통과는 근거가 생긴 뒤에 켠다.";
  }
  if (n < MIN_BAND_SAMPLE) {
    return `≥0.80 밴드의 표본이 ${n}건뿐이다 — ${MIN_BAND_SAMPLE}건은 모여야 임계값의 근거로 쓴다.`;
  }
  if ((top.approvalPct ?? 0) < 90) {
    return `≥0.80인데 승인률이 ${top.approvalPct}%다 — 자동 통과를 켜면 그만큼이 검수 없이 나간다.`;
  }
  const low = bands[2];
  if (low.approvalPct !== null && low.approvalPct >= 60) {
    return `참고: <0.60도 ${low.approvalPct}% 승인됐다. 낮은 점수가 "품질 나쁨"이 아니라 "확인 불가"인 경우가 많다 — 재조사로 돌리면 쓸 만한 초안을 버린다.`;
  }
  return null;
}
