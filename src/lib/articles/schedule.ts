// 자동 아티클 초안은 한 주에 한 편(2026-11-19 Ted, 처음엔 하루 한 편이었다).
//
// 월요일(KST)에 만든다. 그 주(ISO 주, 월요일 시작)에 자동으로 만든 초안이 아직 없으면 어느 요일이든 만든다.
// 그래서 맥미니가 잠들어 월요일 점검을 놓쳐도 다음 점검이 따라잡는다. 슬랙 적체 보고는 그대로 매일이다.
// 관리자 화면의 "새 초안"(잡 article_draft)은 이 셈에 들어가지 않는다 — 필요할 때 따로 만드는 편이다.
// 날짜는 모두 KST YYYY-MM-DD 문자열이고, 계산은 UTC 자정으로 바꿔서 한다(시간대가 끼어들지 않게).
import type { Article } from "@/lib/types";

const DAY_MS = 86_400_000;
const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"] as const;

function toUtc(day: string): Date {
  const d = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) throw new Error(`날짜가 아니에요: ${day}`);
  return d;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** 그 날짜가 속한 ISO 주의 월요일. */
export function weekStart(day: string): string {
  const d = toUtc(day);
  const sinceMonday = (d.getUTCDay() + 6) % 7;
  return iso(new Date(d.getTime() - sinceMonday * DAY_MS));
}

/** 다음 주 월요일. 월요일에 물어도 그다음 월요일이다. */
export function nextWeekStart(day: string): string {
  return iso(new Date(toUtc(weekStart(day)).getTime() + 7 * DAY_MS));
}

/** "11월 23일 월요일". 슬랙 한 줄용. */
export function koreanDay(day: string): string {
  const d = toUtc(day);
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 ${WEEKDAY[d.getUTCDay()]}요일`;
}

/**
 * 자동 초안 스위치. 새 이름 ARTICLE_WEEKLY가 있으면 그것을, 없으면 옛 이름 ARTICLE_DAILY를 읽는다.
 * "0"이면 끈다(적체 보고는 그대로 나간다). 맥미니 .env에 남은 ARTICLE_DAILY=0도 계속 끈다.
 */
export function autoDraftEnabled(env: Record<string, string | undefined>): boolean {
  const v = env.ARTICLE_WEEKLY || env.ARTICLE_DAILY;
  return v !== "0";
}

/** 관리자 "새 초안"으로 만든 편인가. 표시가 없는 옛 행은 자동으로 본다(그 주에 두 편이 나오지 않게). */
export function isManualDraft(a: Pick<Article, "gate">): boolean {
  return a.gate?.origin === "manual";
}

/**
 * 이번 주에 자동으로 만든 편. 있으면 이번 주 몫은 끝났다. 반려된 편도 센다 — 반려하면 그 주 몫을 쓴 것이고,
 * 다음 편은 다음 월요일이다(같은 주에 다시 받으려면 관리자 "새 초안"을 누른다).
 */
export function autoDraftThisWeek<T extends Pick<Article, "gate" | "generatedFor">>(articles: T[], today: string): T | undefined {
  const from = weekStart(today);
  return articles.find((a) => !isManualDraft(a) && a.generatedFor >= from && a.generatedFor <= today);
}
