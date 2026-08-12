// 운영자가 지금 관리해야 할 전시를 고른다. 순수·I/O 없음.
//
// 왜 필요한가: admin의 부스·이벤트·분석 화면이 `listExhibitions({limit:1})`의 첫
// 항목을 썼는데, 저장소 정렬이 id 오름차순이라 "가장 먼저 만든 전시"도 "지금 열리는
// 전시"도 아닌 **id가 알파벳순으로 앞선 전시**가 잡혔다. HOUSE ARCHIVE
// (exh_house_archive_2026)가 추가되자 개막이 2주 뒤인 전시가 운영 화면을 차지하고,
// 이벤트·분석 데이터가 없어 빈 대시보드가 됐다.
import type { Exhibition } from "@/lib/types";

/**
 * 오늘 기준으로 가장 관리할 만한 전시:
 *   1) 지금 열려 있는 것(가장 먼저 시작한 순)
 *   2) 없으면 개막이 가장 가까운 예정 전시
 *   3) 그것도 없으면 가장 최근에 끝난 전시
 * 목록이 비면 undefined.
 *
 * 날짜는 `YYYY-MM-DD` 문자열이라 사전순 비교가 곧 시간순 비교다.
 */
export function pickAdminExhibition(
  exhibitions: Exhibition[],
  today: string,
): Exhibition | undefined {
  if (exhibitions.length === 0) return undefined;

  const running = exhibitions
    .filter((e) => e.startDate <= today && today <= e.endDate)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
  if (running.length > 0) return running[0];

  const upcoming = exhibitions
    .filter((e) => e.startDate > today)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
  if (upcoming.length > 0) return upcoming[0];

  return [...exhibitions].sort((a, b) => b.endDate.localeCompare(a.endDate))[0];
}

/**
 * 운영자가 admin 전시 선택기로 명시 선택한 전시(쿠키)가 있으면 그걸, 없거나
 * 무효(삭제된 전시 id 등)하면 pickAdminExhibition 자동 선택으로 폴백한다.
 */
export function resolveAdminExhibition(
  exhibitions: Exhibition[],
  cookieExhibitionId: string | undefined,
  today: string,
): Exhibition | undefined {
  if (cookieExhibitionId) {
    const found = exhibitions.find((e) => e.id === cookieExhibitionId);
    if (found) return found;
  }
  return pickAdminExhibition(exhibitions, today);
}

/** 로컬 날짜(YYYY-MM-DD) — 이 앱은 한국 전시 기준이라 UTC가 아니라 KST(UTC+9,
 *  DST 없음)로 고정 계산한다. UTC 그대로 쓰면 자정 근처 9시간 동안 전시 상태가
 *  하루 어긋난다(개막일 오전엔 아직 '예정'으로, 종료일 다음날 오전까진 아직
 *  '진행중'으로 잘못 보인다). */
export function todayISO(now = new Date()): string {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}
