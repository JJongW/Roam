import type { EnrichmentCandidate } from "@/lib/types";

/**
 * 반려 사유를 다음 초안의 재료로 바꾼다. **순수 함수** — 무엇을 배웠다고 볼지는
 * 규칙이지 LLM의 판단이 아니다.
 *
 * 두 층으로 나눈다:
 * - 부스별: 그 부스에서 반려된 이유 그대로. 가장 직접적이다.
 * - 전시별: 여러 부스에서 **반복된** 이유만. 한 번 나온 지적을 전시 전체 지침으로
 *   올리면 그건 학습이 아니라 과잉일반화다.
 */

/** 전시 지침으로 올릴 최소 반복 횟수. 1이면 한 번 지적이 전체 규칙이 된다. */
const REPEAT_THRESHOLD = 2;

/** 사유 문자열의 앞머리(코드에서 온 정형 문구)만 떼어 같은 지적끼리 묶는다. */
function head(note: string): string {
  return note.split(" — ")[0].trim();
}

export function rejectionsByBooth(
  rejected: EnrichmentCandidate[],
): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const c of rejected) {
    const note = c.reviewNote?.trim();
    if (!note) continue;
    const list = out.get(c.boothId) ?? [];
    // 같은 부스에서 같은 지적이 여러 번 나와도 프롬프트엔 한 번만.
    if (!list.includes(note)) list.push(note);
    out.set(c.boothId, list);
  }
  return out;
}

export function exhibitionLessons(
  rejected: EnrichmentCandidate[],
  threshold = REPEAT_THRESHOLD,
): string[] {
  const byHead = new Map<string, Set<string>>();
  for (const c of rejected) {
    const note = c.reviewNote?.trim();
    if (!note) continue;
    const key = head(note);
    const booths = byHead.get(key) ?? new Set<string>();
    booths.add(c.boothId);
    byHead.set(key, booths);
  }
  return [...byHead.entries()]
    // **서로 다른 부스**에서 반복돼야 지침이다. 한 부스에서 세 번 반려된 건
    // 그 부스 문제지 전시 전체의 경향이 아니다.
    .filter(([, booths]) => booths.size >= threshold)
    .sort((a, b) => b[1].size - a[1].size)
    .map(([key]) => key);
}
