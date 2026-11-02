import { SURVEY_QUESTIONS, type SurveyQuestion } from "./questions";
import type { SurveyResponse } from "@/lib/types";

export interface OptionTally {
  value: string;
  label: string;
  count: number;
  /** 이 질문에 답한 사람 중 비율(0~100, 반올림). 여러 개 고르는 질문은 합이 100을 넘는다. */
  pct: number;
}

export interface QuestionTally {
  question: SurveyQuestion;
  answered: number;
  options: OptionTally[];
}

export interface DurationSummary {
  /** 시간을 잰 응답 수(예전 응답·측정 실패는 빠진다). */
  measured: number;
  medianMs: number | null;
  /** 1분 안에 낸 비율(0~100). */
  underMinutePct: number | null;
  /** 구간별 응답 수 — 30초 미만, 30초~1분, 1~2분, 2~5분, 5분 이상. */
  buckets: { label: string; count: number }[];
}

export interface SurveySummary {
  total: number;
  duration: DurationSummary;
  today: number;
  lastAt: string | null;
  questions: QuestionTally[];
  comments: { text: string; at: string }[];
}

/** 한국 날짜(YYYY-MM-DD). 서버는 UTC라 그냥 날짜를 자르면 오전 9시 전 응답이 어제가 된다. */
const kstDate = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });

/** 응답을 질문별로 센다(순수). "오늘"은 `now`의 한국 날짜다. */
export function summarizeSurvey(rows: SurveyResponse[], now = new Date()): SurveySummary {
  const sorted = [...rows].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const today = kstDate(now);
  return {
    total: rows.length,
    today: rows.filter((r) => kstDate(new Date(r.updatedAt)) === today).length,
    lastAt: sorted[0]?.updatedAt ?? null,
    duration: summarizeDuration(rows),
    questions: SURVEY_QUESTIONS.map((question) => {
      const picks = rows
        .map((r) => r.answers[question.key])
        .filter((v): v is string | string[] => (Array.isArray(v) ? v.length > 0 : !!v));
      const answered = picks.length;
      return {
        question,
        answered,
        options: question.options.map((o) => {
          const count = picks.filter((v) => (Array.isArray(v) ? v.includes(o.value) : v === o.value)).length;
          return {
            value: o.value,
            label: o.label,
            count,
            pct: answered ? Math.round((count / answered) * 100) : 0,
          };
        }),
      };
    }),
    comments: sorted
      .filter((r) => r.comment)
      .map((r) => ({ text: r.comment as string, at: r.updatedAt })),
  };
}

const BUCKETS: [string, number][] = [
  ["30초 미만", 30_000],
  ["30초~1분", 60_000],
  ["1~2분", 120_000],
  ["2~5분", 300_000],
  ["5분 이상", Infinity],
];

/** 제출까지 걸린 시간. 평균은 안 쓴다 — 탭을 열어 두고 나중에 낸 한 명이 평균을 끌고 간다. */
export function summarizeDuration(rows: SurveyResponse[]): DurationSummary {
  const ms = rows
    .map((r) => r.durationMs)
    .filter((v): v is number => typeof v === "number")
    .sort((a, b) => a - b);
  const n = ms.length;
  const median = n ? (n % 2 ? ms[(n - 1) / 2] : (ms[n / 2 - 1] + ms[n / 2]) / 2) : null;
  let lower = 0;
  return {
    measured: n,
    medianMs: median,
    underMinutePct: n ? Math.round((ms.filter((v) => v < 60_000).length / n) * 100) : null,
    buckets: BUCKETS.map(([label, upper]) => {
      const count = ms.filter((v) => v >= lower && v < upper).length;
      lower = upper;
      return { label, count };
    }),
  };
}

/** 72_400 → "1분 12초". */
export function formatDuration(ms: number): string {
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}초`;
  const m = Math.floor(sec / 60);
  const r = sec % 60;
  return r ? `${m}분 ${r}초` : `${m}분`;
}
