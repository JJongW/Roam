// UI 20 홈(20-01)과 박람회 전체(20-02)가 박람회를 나누는 규칙. iOS `FairGroups`와 같은 규칙이다.
// 순수 함수라 화면과 떼어 시험한다(fair-groups.test.ts).
import type { Exhibition } from "@/lib/types";
import { pickSeriesRepresentative } from "./status";

/** 줄 하나가 아는 것: 박람회와 열 수 있는지(지도에 놓인 부스가 있는지, openable.ts). */
export interface FairEntry {
  fair: Exhibition;
  openable: boolean;
}

export interface FairGroups {
  /** 오늘 열려 있고 열 수 있는 곳. 끝나는 날이 가까운 순. */
  open: FairEntry[];
  /** 아직 안 열렸거나, 날짜는 열렸는데 지도가 없어 열 수 없는 곳. 시작일 순. */
  upcoming: FairEntry[];
  /** 끝났고 열 수 있었던 곳. 최근에 끝난 순. 지도 없이 끝난 곳은 보이지 않는다. */
  ended: FairEntry[];
}

/**
 * 박람회를 세 묶음으로 나눈다(11-20 Ted, UI 20).
 * - 날짜는 열렸어도 지도가 없으면 "곧 열려요" 쪽에 흐리게 둔다(`openable:false`).
 * - 같은 회차 시리즈는 하나만 남긴다(status.ts `pickSeriesRepresentative`).
 */
export function groupFairs(entries: FairEntry[], today: string): FairGroups {
  const byId = new Map(entries.map((e) => [e.fair.id, e]));
  const open: Exhibition[] = [];
  const upcoming: Exhibition[] = [];
  const ended: Exhibition[] = [];
  for (const { fair, openable } of entries) {
    if (today < fair.startDate) upcoming.push(fair);
    else if (today > fair.endDate) {
      if (openable) ended.push(fair);
    } else if (openable) open.push(fair);
    else upcoming.push(fair);
  }
  const back = (list: Exhibition[]) => list.map((f) => byId.get(f.id)!);
  return {
    open: back(
      pickSeriesRepresentative(
        [...open].sort((a, b) => a.endDate.localeCompare(b.endDate)),
        "ongoing",
      ),
    ),
    upcoming: back(
      pickSeriesRepresentative(
        [...upcoming].sort((a, b) => a.startDate.localeCompare(b.startDate)),
        "upcoming",
      ),
    ),
    ended: back(
      pickSeriesRepresentative(
        [...ended].sort((a, b) => b.endDate.localeCompare(a.endDate)),
        "ended",
      ),
    ),
  };
}

/** 20-01 홈의 "그 밖" 자리 수. 곧 열려요는 전부, 나머지는 세 곳 정도(11-20 Ted). */
export const HOME_OTHERS = 3;

/** 홈에 보일 열린 곳과 끝난 곳. 열린 곳을 먼저 채우고 남는 자리를 최근에 끝난 곳으로 채운다. */
export function homeOthers(groups: FairGroups): { open: FairEntry[]; ended: FairEntry[] } {
  const open = groups.open.slice(0, HOME_OTHERS);
  const ended = groups.ended.slice(0, Math.max(0, HOME_OTHERS - open.length));
  return { open, ended };
}

/** "2026-12-04" → "12월 4일". 시간대를 타지 않게 문자열로만 읽는다. */
export function monthDay(iso: string): string {
  const [, m, d] = iso.slice(0, 10).split("-").map(Number);
  return `${m}월 ${d}일`;
}

/** 행사장 이름의 괄호 설명과 가운뎃점 뒤 부연은 줄인다(가운뎃점 금지, 브랜드 규칙 §5). */
export function shortVenue(venue: string): string {
  return venue.split(" (")[0].split(/\s*·\s*/)[0].trim();
}

/**
 * 박람회 줄 아래 글(Figma 20-00).
 * - 열림: "코엑스 B홀, 11월 23일까지"
 * - 곧 열림: "코엑스 C홀, 12월 4일부터 7일까지"(같은 달이면 뒤 달을 뺀다)
 * - 끝남: "코엑스 전관, 11월 9일에 끝났어요"
 */
export function fairSubtitle(entry: FairEntry, today: string): string {
  const { fair, openable } = entry;
  const venue = shortVenue(fair.venue);
  const start = monthDay(fair.startDate);
  const end = monthDay(fair.endDate);
  const lead = venue ? `${venue}, ` : "";
  if (today > fair.endDate) return `${lead}${end}에 끝났어요`;
  if (today >= fair.startDate && openable) return `${lead}${end}까지`;
  if (start === end) return `${lead}${start}`;
  const month = start.split(" ")[0];
  const tail = end.startsWith(`${month} `) ? end.slice(month.length + 1) : end;
  return `${lead}${start}부터 ${tail}까지`;
}

/** 홈 머리 한 줄(20-01). 열린 곳이 있으면 몇 곳인지, 없으면 다음에 열리는 날. */
export function homeHeadline(groups: FairGroups): string {
  const n = groups.open.length;
  if (n > 0) return `오늘은 ${n === 1 ? "한 곳" : `${n}곳`}이 열려 있어요`;
  const next = groups.upcoming[0];
  if (next) return `다음 박람회는 ${monthDay(next.fair.startDate)}에 열려요`;
  return "오늘 열린 박람회는 없어요";
}
