import { format } from "date-fns";

import type { AnalyticsEvent, UserSignal } from "@/lib/types";

export interface TimelineEvent {
  id: string;
  createdAt: string;
  source: "signal" | "analytics";
  label: string;
  userId?: string;
  userLabel: string;
  boothLabel?: string;
}

const SIGNAL_LABELS: Record<string, string> = {
  booth_bookmarked: "북마크",
  route_saved: "동선 저장",
  feed_click: "피드 클릭",
  reaction_must: "꼭 갈래",
  reaction_curious: "끌려",
  reaction_pass: "패스",
  verdict_good: "좋았어",
  verdict_ok: "그냥그랬어",
  verdict_bad: "아니었어",
  search_query: "검색",
};

const ANALYTICS_LABELS: Record<string, string> = {
  view: "조회",
  dwell: "체류",
  route_start: "동선 시작",
  route_complete: "동선 완료",
  booth_arrive: "부스 도착",
  event_bookmark: "이벤트 북마크",
};

/**
 * UserSignal·AnalyticsEvent를 하나의 타임라인으로 병합(최신순). AnalyticsEvent는
 * sessionId 기반(익명)이라 userId/userLabel이 항상 "익명 세션"으로 고정된다.
 */
export function buildTimeline(
  signals: UserSignal[],
  analytics: AnalyticsEvent[],
  userNicknames: Map<string, string>,
  boothNamesByCode: Map<string, string>,
  boothNamesById: Map<string, string>,
): TimelineEvent[] {
  const fromSignals: TimelineEvent[] = signals.map((s) => ({
    id: s.id,
    createdAt: s.createdAt,
    source: "signal",
    label: SIGNAL_LABELS[s.kind] ?? s.kind,
    userId: s.userId,
    userLabel: userNicknames.get(s.userId) ?? "알 수 없음",
    boothLabel: s.boothCode
      ? (boothNamesByCode.get(s.boothCode) ?? s.boothCode)
      : undefined,
  }));
  const fromAnalytics: TimelineEvent[] = analytics.map((a) => ({
    id: a.id,
    createdAt: a.createdAt,
    source: "analytics",
    label: ANALYTICS_LABELS[a.type] ?? a.type,
    userLabel: "익명 세션",
    boothLabel: a.boothId
      ? (boothNamesById.get(a.boothId) ?? a.boothId)
      : undefined,
  }));
  return [...fromSignals, ...fromAnalytics].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
}

/**
 * 최신순으로 정렬된 이벤트를 날짜(로컬 자정 기준) 그룹으로 묶는다 — 연속된
 * 같은 날짜만 한 그룹으로 합친다(재정렬하지 않는다). buildTimeline이 이미
 * 최신순으로 정렬해 반환하므로 여기선 그 순서를 그대로 신뢰한다.
 */
export function groupEventsByDay(
  events: TimelineEvent[],
): { dateLabel: string; events: TimelineEvent[] }[] {
  const groups: { dateLabel: string; events: TimelineEvent[] }[] = [];
  for (const event of events) {
    const dateLabel = format(new Date(event.createdAt), "yyyy년 M월 d일");
    const last = groups[groups.length - 1];
    if (last && last.dateLabel === dateLabel) {
      last.events.push(event);
    } else {
      groups.push({ dateLabel, events: [event] });
    }
  }
  return groups;
}
