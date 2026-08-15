import type { Booth } from "@/lib/types";

/** 부스 코드 자연 정렬 비교자 — "C2" < "C10"(문자열 비교였다면 반대로 됨,
 *  숫자를 문자로 안 보고 크기로 비교). 코드 있는 부스를 항상 앞에, 그 안에서
 *  자연 정렬. 둘 다 코드 없으면 이름순. 도면 들고 대조하는 관리자 시나리오에서
 *  삽입 순서보다 항상 유리해서 부스 목록 기본 정렬로 쓴다. */
export function compareBoothsByCode(a: Booth, b: Booth): number {
  if (a.code && b.code) {
    return a.code.localeCompare(b.code, "en", {
      numeric: true,
      sensitivity: "base",
    });
  }
  if (a.code && !b.code) return -1;
  if (!a.code && b.code) return 1;
  return a.name.localeCompare(b.name, "ko");
}

/** 이름·회사·코드 중 하나라도 검색어를 포함하면 매칭(대소문자 무시).
 *  빈/공백 검색어는 전부 통과시킨다(필터 없음 상태). */
export function matchesBoothQuery(booth: Booth, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    booth.name.toLowerCase().includes(q) ||
    booth.company.toLowerCase().includes(q) ||
    (booth.code?.toLowerCase().includes(q) ?? false)
  );
}
