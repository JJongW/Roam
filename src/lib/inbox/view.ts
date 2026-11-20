// UI 18 알림함(18-02, 18-03) 화면 계산. 순수.
//
// iOS `NotificationInbox.swift`(InboxTime, InboxItem.icon)와 `PushLanding`을 옮겼다. 같은 줄은 같은 곳으로 간다.
// 도착(11-13 Ted, 섹션 38): 박람회 알림은 그 지도, 브랜드 알림은 그 브랜드. 웹에는 브랜드 상세 화면이 없어
// 이번 박람회 부스 상세(13-04가 "지금은 부스 상세로만 그릴 수 있어요"라고 적은 것)로 간다. 부스가 아직 없는
// 참가면 그 박람회 지도로 간다(iOS `.brand(slug, nil)`과 같음).
import { todayISO } from "@/lib/exhibition/current";
import { label } from "@/lib/copy/v1";

/** 서버 `GET /api/me/notifications`의 `items[]`(lib/notifications/inbox.ts) 중 화면이 읽는 칸. */
export interface InboxRow {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  readAt: string | null;
  landing: { kind: string; slug: string; exhibitorIds?: string[]; boothId?: string };
}

export type InboxIcon = "brand" | "fair" | "article" | "verdict";

/** 줄 아이콘(Figma `UI/알림 줄` 설명: 브랜드=heart Fill, 박람회=calendar, 새 글=book-open, 평가=message-circle). */
export function inboxIcon(row: InboxRow): InboxIcon {
  switch (row.landing.kind) {
    case "fair":
      return "fair";
    case "verdict":
      return "verdict";
    case "article":
      return "article";
    default:
      return "brand";
  }
}

/** 눌렀을 때 갈 곳. 모르는 종류면 null(줄은 읽음만 된다). */
export function inboxHref(row: InboxRow): string | null {
  const { kind, slug, boothId } = row.landing;
  if (!slug) return null;
  const map = `/exhibitions/${encodeURIComponent(slug)}/map`;
  switch (kind) {
    case "fair":
    case "verdict":
      return map;
    case "brand":
      return boothId ? `/booths/${encodeURIComponent(boothId)}` : map;
    default:
      return null;
  }
}

/** 두 날(YYYY-MM-DD) 사이 날 수. */
function daysBetween(a: string, b: string): number {
  const t = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
  return Math.round((t(b) - t(a)) / 86_400_000);
}

/** 서울 날짜로 "오늘", "어제", 그 전은 "11월 28일". 못 읽으면 "". */
export function inboxTimeLabel(createdAt: string, now = new Date()): string {
  const d = new Date(createdAt);
  if (Number.isNaN(d.getTime())) return "";
  const day = todayISO(d);
  const diff = daysBetween(day, todayISO(now));
  if (diff <= 0) return label.today;
  if (diff === 1) return label.yesterday;
  return `${Number(day.slice(5, 7))}월 ${Number(day.slice(8, 10))}일`;
}

/** 7일 안이면 "이번 주" 묶음. */
export function isThisWeek(createdAt: string, now = new Date()): boolean {
  const d = new Date(createdAt);
  if (Number.isNaN(d.getTime())) return false;
  return daysBetween(todayISO(d), todayISO(now)) < 7;
}
