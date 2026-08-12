import type { Booth, BoothNote } from "@/lib/types";

// CLAUDE.md "최소 필수 6종" — 이 6개가 다 채워질수록 근거 카드 품질이 올라간다.
const REQUIRED_ENRICHMENT_FIELDS = [
  "summary",
  "valueTags",
  "recommendationReasons",
  "thingsToDo",
  "timing",
  "memoryHooks",
] as const;

export interface BoothGap {
  boothId: string;
  boothName: string;
  missingFields: string[];
}

function isEmptyValue(value: unknown): boolean {
  if (value == null) return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "string") return value.trim() === "";
  if (typeof value === "object") return Object.keys(value).length === 0;
  return false;
}

/** 부스별로 "최소 필수 6종" 중 비어 있는 필드를 찾는다. 결측 많은 순으로 정렬. */
export function findBoothEnrichmentGaps(booths: Booth[]): BoothGap[] {
  const gaps: BoothGap[] = [];
  for (const booth of booths) {
    const missing: string[] = [];
    for (const field of REQUIRED_ENRICHMENT_FIELDS) {
      const value = booth.enrichment?.[field];
      if (isEmptyValue(value)) missing.push(field);
    }
    if (missing.length > 0) {
      gaps.push({
        boothId: booth.id,
        boothName: booth.name,
        missingFields: missing,
      });
    }
  }
  return gaps.sort((a, b) => b.missingFields.length - a.missingFields.length);
}

export interface NoteInconsistency {
  userId: string;
  boothId: string;
  reason: "verdict_without_visitedAt";
}

/**
 * 판단 레코드 정합성 체크. verdict는 항상 visitedAt과 같이 있어야 한다는 게 쓰기
 * 경로의 불변조건인데(judgment-vocabulary), 깨졌다면 로미의 취향 추론이 조용히
 * 틀어질 수 있는 신호다.
 */
export function findNoteInconsistencies(
  notes: BoothNote[],
): NoteInconsistency[] {
  const issues: NoteInconsistency[] = [];
  for (const note of notes) {
    if (note.verdict && !note.visitedAt) {
      issues.push({
        userId: note.userId,
        boothId: note.boothId,
        reason: "verdict_without_visitedAt",
      });
    }
  }
  return issues;
}
