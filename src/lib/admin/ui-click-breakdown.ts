import type { AnalyticsEvent } from "@/lib/types";

export interface UiClickCount {
  control: string;
  count: number;
}

/**
 * 버튼(지도 컨트롤·피드 CTA·컴패니언 바 등) 클릭 집계 — meta.control로 묶어
 * count 내림차순. 순수, 테스트 가능. control이 없는 이벤트는 뺀다.
 */
export function uiClickBreakdown(events: AnalyticsEvent[]): UiClickCount[] {
  const counts = new Map<string, number>();
  for (const e of events) {
    if (e.type !== "ui_click") continue;
    const control = e.meta?.control;
    if (typeof control !== "string" || !control) continue;
    counts.set(control, (counts.get(control) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([control, count]) => ({ control, count }))
    .sort((a, b) => b.count - a.count);
}
