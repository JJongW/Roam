// UI 11 끝난 박람회 지도(F-B, M4). iOS `FairMapViewModel+Phase3`와 같은 규칙. 순수 함수라 시험한다.
import { isHearted, isVisited, type BoothRecord } from "@/lib/stores/visit";

/** 이 부스에 사용자가 직접 남긴 것이 있나(하트, 다녀왔어요, 평가, 메모). */
export function hasLeft(r: BoothRecord | undefined): boolean {
  return isHearted(r) || isVisited(r) || !!r?.verdict || !!r?.memo?.trim();
}

/**
 * F-B: 끝난 박람회는 남긴 곳만 밝게. 남긴 게 없으면 F-A(전부 보통, `null`).
 * 편의시설은 늘 밝게 둔다(길 찾기 표식이라 흐리면 안 된다).
 */
export function brightOnly(
  booths: { id: string; kind?: string | null }[],
  records: Record<string, BoothRecord>,
): Set<string> | null {
  const left = booths.filter((b) => b.kind !== "facility" && hasLeft(records[b.id]));
  if (!left.length) return null;
  return new Set([...left, ...booths.filter((b) => b.kind === "facility")].map((b) => b.id));
}

/** M4 다음으로 물을 부스: 이 박람회에서 다녀왔고 평가가 없는 곳(먼저 다녀온 순). */
export function verdictCandidate<T extends { id: string; kind?: string | null }>(
  booths: T[],
  records: Record<string, BoothRecord>,
): T | null {
  const list = booths.filter(
    (b) => b.kind !== "facility" && isVisited(records[b.id]) && !records[b.id]?.verdict,
  );
  list.sort((a, b) => (records[a.id]?.visitedAt ?? "").localeCompare(records[b.id]?.visitedAt ?? ""));
  return list[0] ?? null;
}
