/**
 * 방문객이 이 박람회를 열 수 있나(2026-11-20 Ted 결정).
 *
 * 브랜드부터 올린 박람회는 참가 사실만 있고 지도에 놓인 부스가 0곳이다. 지도 먼저(브랜드
 * 규칙 §4)인데 지도가 없는 박람회를 열면 빈 화면이 된다. 그래서 그런 박람회는 목록에
 * 흐리게 "진행 예정"으로만 보이고, 상세, 부스, 지도, 참가 브랜드를 내주지 않는다.
 *
 * 기준은 하나다: **지도에 놓인 부스가 한 곳이라도 있나.** 웹, API, iOS가 모두 이 기준을
 * 쓴다(iOS는 API의 `openable` 칸을 읽는다). 날짜 상태(예정, 진행 중, 종료)와는 다른 축이다.
 *
 * "놓였다" = 좌표가 (0,0)이 아니다. 인입은 도면(FLOORPLANS)에 없는 코드를 0,0으로 만든다
 * (intake/plan.ts). 편의시설(facility)은 지도에만 있는 칸이라 세지 않는다.
 */
export type FairAvailability = "open" | "upcoming_no_map";

export function isBoothPlaced(b: { x: number; y: number; kind?: string | null }): boolean {
  if (b.kind === "facility") return false;
  return !(b.x === 0 && b.y === 0);
}

export function isFairOpen(booths: readonly { x: number; y: number; kind?: string | null }[]): boolean {
  return booths.some(isBoothPlaced);
}

export function availabilityOf(open: boolean): FairAvailability {
  return open ? "open" : "upcoming_no_map";
}

/** API 응답에 더하는 칸. 키를 더하기만 해서 옛 앱의 디코딩은 그대로다. */
export function openFields(open: boolean): { openable: boolean; availability: FairAvailability } {
  return { openable: open, availability: availabilityOf(open) };
}
