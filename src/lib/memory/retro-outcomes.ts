import type { BoothNote } from "@/lib/types";

export type OutcomeKind = "hit" | "reversal";

export interface OutcomeCard {
  boothId: string;
  boothName: string;
  interest: "must" | "curious" | "pass";
  verdict: "good" | "ok" | "bad";
  kind: OutcomeKind;
}

/**
 * 관심(피드)과 결과(현장 판정)가 같은 방향이면 적중, 다르면 반전. "관심 있었다"는
 * must·curious, "패스했다"는 pass. "결과가 좋았다"는 good·ok(그냥그랬어도 나쁘진
 * 않았다는 뜻이라 "적중" 쪽으로 묶는다 — 2단계로만 나누기로 했다), "나빴다"는 bad.
 */
export function classifyOutcome(
  interest: "must" | "curious" | "pass",
  verdict: "good" | "ok" | "bad",
): OutcomeKind {
  const wasInterested = interest === "must" || interest === "curious";
  const wasGood = verdict === "good" || verdict === "ok";
  return wasInterested === wasGood ? "hit" : "reversal";
}

/**
 * interest·verdict 둘 다 있는 노트만 "예측-결과" 카드로 만든다(한쪽만 있으면
 * 비교 자체가 성립하지 않는다). judgedClass=confident(브레인 확신 가치와 겹치는
 * 부스)를 먼저 배치해 상위 limit개만 남긴다 — 판정한 부스가 많아도 "빠르게
 * 회고하는 느낌"을 지키려고 다 보여주지 않는다.
 */
export function buildOutcomeCards(
  notes: BoothNote[],
  boothNameById: Record<string, string>,
  limit = 4,
): OutcomeCard[] {
  const eligible = notes.filter((n) => n.interest && n.verdict);
  const sorted = [...eligible].sort((a, b) => {
    const aConf = a.judgedClass === "confident" ? 0 : 1;
    const bConf = b.judgedClass === "confident" ? 0 : 1;
    return aConf - bConf;
  });
  return sorted.slice(0, limit).map((n) => ({
    boothId: n.boothId,
    boothName: boothNameById[n.boothId] ?? n.boothId,
    interest: n.interest as "must" | "curious" | "pass",
    verdict: n.verdict as "good" | "ok" | "bad",
    kind: classifyOutcome(
      n.interest as "must" | "curious" | "pass",
      n.verdict as "good" | "ok" | "bad",
    ),
  }));
}
