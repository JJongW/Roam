import type { Exhibition } from "@/lib/types";

export type ExhibitionStatusKind = "upcoming" | "ongoing" | "ended";

/** startDate·endDate와 오늘 날짜(YYYY-MM-DD) 문자열 비교만으로 판정한다 —
 *  DB에 상태 필드가 따로 없다. 시작·종료 당일은 모두 ongoing에 포함한다. */
export function exhibitionStatus(
  ex: Exhibition,
  todayISO: string,
): ExhibitionStatusKind {
  if (todayISO < ex.startDate) return "upcoming";
  if (todayISO > ex.endDate) return "ended";
  return "ongoing";
}

/** "제N회" 접두사(공백 허용)를 떼어낸 나머지를 회차 묶음 키로 쓴다. 접두사가
 *  없으면 이름 그대로가 키라 그 전시 혼자 자기 묶음이 된다. */
export function seriesKeyOf(name: string): string {
  return name.replace(/^제\s*\d+\s*회\s*/, "").trim();
}

/**
 * 같은 회차 시리즈(seriesKeyOf가 같은)는 대표 전시 하나로 합친다 — 새 회차
 * 페이지 없이 홈 목록 자리 하나만 차지하게 한다. upcoming·ongoing은 가장
 * 임박한(startDate 오름차순) 것을, ended는 가장 최근에 끝난(endDate 내림차순)
 * 것을 대표로 남긴다. 반환 순서는 입력에서 각 시리즈가 처음 등장한 순서를
 * 그대로 따른다 — 이 함수는 정렬을 새로 하지 않고 중복만 걷어낸다(정렬은
 * 호출부 책임).
 */
export function pickSeriesRepresentative(
  exhibitions: Exhibition[],
  status: ExhibitionStatusKind,
): Exhibition[] {
  const groups = new Map<string, Exhibition[]>();
  const firstSeenOrder: string[] = [];
  for (const ex of exhibitions) {
    const key = seriesKeyOf(ex.name);
    if (!groups.has(key)) {
      groups.set(key, []);
      firstSeenOrder.push(key);
    }
    groups.get(key)!.push(ex);
  }
  return firstSeenOrder.map((key) => {
    const group = groups.get(key)!;
    if (status === "ended") {
      return [...group].sort((a, b) => b.endDate.localeCompare(a.endDate))[0];
    }
    return [...group].sort((a, b) => a.startDate.localeCompare(b.startDate))[0];
  });
}
