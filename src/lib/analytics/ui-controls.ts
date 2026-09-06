/**
 * ui_click 컨트롤 어휘 — **단일 소스**.
 *
 * 예전엔 컨트롤 이름이 그냥 자유 문자열이었고, 이벤트를 쏘는 헬퍼가 컴포넌트마다
 * 복사돼 있었으며, 사람이 읽을 라벨은 또 다른 파일(ui-click-chart)에 따로 있었다.
 * 그래서 컨트롤을 하나 추가해도 라벨 맵을 건드릴 일이 없었고, 관리자 화면엔
 * 그때부터 raw slug가 그대로 떴다 — 새 값이 생겼는데 소비하는 쪽을 아무도 안
 * 찾는, 관리자 계정 목록이 Apple 계정을 "구글 연동"으로 보여준 것과 같은 사고다.
 *
 * 이제 여기 목록에 없는 이름은 타입이 막고, 라벨은 Record<UiControl, string>이라
 * 목록에 추가하면 라벨을 안 쓰고는 빌드가 안 된다.
 */
export const UI_CONTROLS = [
  "map_zoom_in",
  "map_zoom_out",
  "map_reset_view",
  "map_rotate",
  "feed_exhausted_finish",
  "feed_exhausted_map",
  "feed_repick",
  "companion_bar_open",
  "companion_faq_q1",
  "companion_faq_q2",
  "companion_faq_q3",
  "finish_visit_start",
] as const;

export type UiControl = (typeof UI_CONTROLS)[number];

/** 운영 콘솔 표시용 라벨. 컨트롤을 추가하면 여기도 채워야 컴파일된다. */
export const UI_CONTROL_LABELS: Record<UiControl, string> = {
  map_zoom_in: "지도 확대",
  map_zoom_out: "지도 축소",
  map_reset_view: "지도 전체 보기",
  map_rotate: "지도 회전",
  feed_exhausted_finish: "피드 소진 · 마치기",
  feed_exhausted_map: "피드 소진 · 지도로",
  feed_repick: "피드 새로 고르기",
  companion_bar_open: "컴패니언 바 열기",
  companion_faq_q1: "컴패니언 FAQ 1",
  companion_faq_q2: "컴패니언 FAQ 2",
  companion_faq_q3: "컴패니언 FAQ 3",
  finish_visit_start: "관람 마치기 시작",
};

/**
 * 이벤트를 어느 전시에 붙일지. 컴패니언 바는 전시 홈 밖(지도·부스 상세)에서도
 * 눌리는데 그때는 경로에 slug가 없다 — 그 경우에만 스토어의 exhibitionId로
 * 붙인다. 둘 다 없으면 귀속할 데가 없으므로 쏘지 않는다.
 */
export type UiClickAttribution = {
  exhibitionSlug?: string | null;
  exhibitionId?: string | null;
};

/**
 * ui_click 이벤트 1건 발사. 실패는 삼킨다 — 텔레메트리가 화면을 막으면 안 된다.
 * 네 컴포넌트가 각자 들고 있던 같은 fetch를 여기로 모았다.
 */
export function trackUiClick(
  attribution: UiClickAttribution,
  control: UiControl,
): void {
  const { exhibitionSlug, exhibitionId } = attribution;
  if (!exhibitionSlug && !exhibitionId) return;
  void fetch("/api/analytics/events", {
    method: "POST",
    // 지도 컨트롤은 화면 전환 직전에 눌리는 일이 잦아 언로드에도 살아남아야 한다.
    keepalive: true,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      type: "ui_click",
      ...(exhibitionSlug ? { exhibitionSlug } : { exhibitionId }),
      meta: { control },
    }),
  }).catch(() => {});
}
