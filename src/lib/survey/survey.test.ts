import { describe, expect, it } from "vitest";
import { surveyResponseInputSchema } from "@/lib/schemas";
import { SURVEY_QUESTIONS } from "./questions";
import { formatDuration, summarizeDuration, summarizeSurvey } from "./aggregate";
import type { SurveyResponse } from "@/lib/types";

/** 모든 질문에 첫 보기를 고른 응답. */
const full = () =>
  Object.fromEntries(
    SURVEY_QUESTIONS.map((q) => [q.key, q.multi ? [q.options[0].value] : q.options[0].value]),
  );

describe("설문 입력 검증", () => {
  it("모든 질문에 답하면 통과하고, 자유 의견은 선택이다", () => {
    expect(surveyResponseInputSchema.safeParse({ answers: full() }).success).toBe(true);
  });

  it("빠진 질문이 있으면 막는다", () => {
    const a = full();
    delete a.freq;
    expect(surveyResponseInputSchema.safeParse({ answers: a }).success).toBe(false);
  });

  it("보기에 없는 값, 모르는 질문, 한도를 넘는 다중 선택을 막는다", () => {
    expect(surveyResponseInputSchema.safeParse({ answers: { ...full(), freq: "daily" } }).success).toBe(false);
    expect(surveyResponseInputSchema.safeParse({ answers: { ...full(), age: "20" } }).success).toBe(false);
    expect(
      surveyResponseInputSchema.safeParse({ answers: { ...full(), pain: ["find", "route", "miss"] } }).success,
    ).toBe(false);
  });

  it("하나만 고르는 질문에 배열을 보내면 막는다", () => {
    expect(surveyResponseInputSchema.safeParse({ answers: { ...full(), freq: ["month"] } }).success).toBe(false);
  });
});

describe("설문 집계", () => {
  const row = (answers: Record<string, string | string[]>, updatedAt: string, comment?: string): SurveyResponse => ({
    surveyId: "s",
    respondentId: updatedAt,
    answers,
    comment,
    createdAt: updatedAt,
    updatedAt,
  });

  it("보기별 수와 답한 사람 대비 비율을 센다 — 여러 개 고르는 질문은 합이 100을 넘을 수 있다", () => {
    const s = summarizeSurvey([
      row({ freq: "month", pain: ["find", "route"] }, "2026-10-16T01:00:00Z"),
      row({ freq: "month", pain: ["find"] }, "2026-10-16T02:00:00Z"),
      row({ freq: "year" }, "2026-10-16T03:00:00Z"),
    ]);
    const freq = s.questions.find((q) => q.question.key === "freq")!;
    expect(freq.answered).toBe(3);
    expect(freq.options.find((o) => o.value === "month")).toMatchObject({ count: 2, pct: 67 });
    const pain = s.questions.find((q) => q.question.key === "pain")!;
    expect(pain.answered).toBe(2);
    expect(pain.options.find((o) => o.value === "find")).toMatchObject({ count: 2, pct: 100 });
  });

  it("'오늘'은 한국 날짜로 센다 — UTC 자정~오전 9시 응답도 오늘이다", () => {
    const now = new Date("2026-10-16T05:00:00Z"); // 한국 14시
    const s = summarizeSurvey(
      [row({}, "2026-10-15T16:00:00Z"), row({}, "2026-10-15T14:00:00Z")], // 한국 16일 01시, 15일 23시
      now,
    );
    expect(s.today).toBe(1);
  });

  it("자유 의견은 최근 순, 빈 의견은 뺀다", () => {
    const s = summarizeSurvey([
      row({}, "2026-10-16T01:00:00Z", "먼저"),
      row({}, "2026-10-16T02:00:00Z", ""),
      row({}, "2026-10-16T03:00:00Z", "나중"),
    ]);
    expect(s.comments.map((c) => c.text)).toEqual(["나중", "먼저"]);
    expect(s.lastAt).toBe("2026-10-16T03:00:00Z");
  });
});

describe("답하는 데 걸린 시간", () => {
  const r = (durationMs: number | null): SurveyResponse => ({
    surveyId: "s", respondentId: String(Math.random()), answers: {}, durationMs,
    createdAt: "2026-10-16T00:00:00Z", updatedAt: "2026-10-16T00:00:00Z",
  });

  it("중간값·1분 안 비율·구간을 센다 — 시간을 안 잰 응답은 뺀다", () => {
    const d = summarizeDuration([r(20_000), r(45_000), r(70_000), r(400_000), r(null)]);
    expect(d.measured).toBe(4);
    expect(d.medianMs).toBe(57_500);
    expect(d.underMinutePct).toBe(50);
    expect(d.buckets.map((b) => b.count)).toEqual([1, 1, 1, 0, 1]);
  });

  it("사람이 읽는 시간으로 쓴다", () => {
    expect(formatDuration(42_000)).toBe("42초");
    expect(formatDuration(72_400)).toBe("1분 12초");
    expect(formatDuration(120_000)).toBe("2분");
  });

  it("음수나 하루 넘는 값은 입력에서 막는다", () => {
    const answers = Object.fromEntries(
      SURVEY_QUESTIONS.map((q) => [q.key, q.multi ? [q.options[0].value] : q.options[0].value]),
    );
    expect(surveyResponseInputSchema.safeParse({ answers, durationMs: -1 }).success).toBe(false);
    expect(surveyResponseInputSchema.safeParse({ answers, durationMs: 90_000_000 }).success).toBe(false);
    expect(surveyResponseInputSchema.safeParse({ answers, durationMs: 48_000 }).success).toBe(true);
  });
});
