// 끝난 박람회 입구(UI 11-01 H-B, 11-08 M3, 11-10 M6)를 띄울지 정한다. iOS `LeftByFair`와 같은 규칙.
// 원천은 이 브라우저의 다녀온 기록(stores/visit.ts)을 박람회별로 묶은 것(lib/me/view.ts groupByFair).
import type { FairGroup } from "./view";

/** "YYYY-MM-DD" 두 날 사이 날 수(b - a). */
export function daysBetween(a: string, b: string): number {
  const ms = Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

/** M3, M6이 묻는 기간: 끝나고 14일 안(iOS와 같다). */
export const VERDICT_ASK_DAYS = 14;
/** H-B "지난주에 다녀오신 박람회": 끝나고 7일 안. */
export const LAST_WEEK_DAYS = 7;

/**
 * 평가를 물어볼 박람회 하나: 최근에 끝났고, 다녀온 곳 중 평가가 없는 곳이 있다.
 * 가장 최근에 끝난 곳부터. "나중에 할게요"를 누른 박람회(`dismissed`)는 다시 묻지 않는다.
 */
export function needsVerdict(
  visited: FairGroup[],
  verdictOf: (boothId: string) => string | undefined,
  today: string,
  dismissed: (slug: string) => boolean = () => false,
): FairGroup | null {
  return (
    visited
      .filter(
        (g) =>
          g.phase === "ended" &&
          daysBetween(g.fair.endDate, today) <= VERDICT_ASK_DAYS &&
          !dismissed(g.fair.slug) &&
          g.rows.some((r) => !verdictOf(r.boothId)),
      )
      .sort((a, b) => b.fair.endDate.localeCompare(a.fair.endDate))[0] ?? null
  );
}

/** H-B: 끝나고 7일 안이고 실제로 다녀온 곳이 있는 박람회. 최근에 끝난 순. */
export function visitedLastWeek(visited: FairGroup[], today: string): FairGroup[] {
  return visited
    .filter(
      (g) =>
        g.phase === "ended" &&
        g.rows.length > 0 &&
        daysBetween(g.fair.endDate, today) <= LAST_WEEK_DAYS,
    )
    .sort((a, b) => b.fair.endDate.localeCompare(a.fair.endDate));
}

/** "나중에 할게요"를 기억하는 키(iOS `roam.m3.dismissed.<slug>`와 같은 이름). */
export const verdictDismissKey = (slug: string) => `roam.m3.dismissed.${slug}`;

export function isVerdictDismissed(slug: string): boolean {
  try {
    return window.localStorage.getItem(verdictDismissKey(slug)) === "1";
  } catch {
    return false;
  }
}

export function dismissVerdict(slug: string) {
  try {
    window.localStorage.setItem(verdictDismissKey(slug), "1");
  } catch {
    // 남기지 못하면 다음에 한 번 더 물을 뿐이다.
  }
}
