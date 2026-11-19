import { describe, expect, it } from "vitest";
import type { Article } from "@/lib/types";
import { autoDraftEnabled, autoDraftThisWeek, koreanDay, nextWeekStart, weekStart } from "./schedule";

type Row = Pick<Article, "gate" | "generatedFor">;
const row = (generatedFor: string, origin?: "schedule" | "manual"): Row => ({
  generatedFor,
  gate: { ok: true, writer: "template", issues: [], rejectedAttempts: [], checkedAt: "", ...(origin ? { origin } : {}) },
});

describe("주 계산(KST 날짜, ISO 주)", () => {
  it("월요일이 주의 시작이고 일요일은 그 주의 끝이다", () => {
    expect(weekStart("2026-11-23")).toBe("2026-11-23"); // 월
    expect(weekStart("2026-11-19")).toBe("2026-11-16"); // 목
    expect(weekStart("2026-11-29")).toBe("2026-11-23"); // 일
    expect(weekStart("2027-01-01")).toBe("2026-12-28"); // 해를 넘는 주
  });

  it("다음 초안 날은 다음 주 월요일이다", () => {
    expect(nextWeekStart("2026-11-19")).toBe("2026-11-23");
    expect(nextWeekStart("2026-11-23")).toBe("2026-11-30");
    expect(koreanDay("2026-11-23")).toBe("11월 23일 월요일");
  });
});

describe("이번 주 자동 편", () => {
  it("이번 주 자동 편만 센다. 지난주 편과 관리자 편은 세지 않는다", () => {
    expect(autoDraftThisWeek([row("2026-11-22")], "2026-11-23")).toBeUndefined(); // 지난주 일요일
    expect(autoDraftThisWeek([row("2026-11-23", "manual")], "2026-11-24")).toBeUndefined();
    expect(autoDraftThisWeek([row("2026-11-23", "schedule")], "2026-11-29")).toBeDefined();
  });

  it("표시가 없는 옛 행은 자동 편으로 본다", () => {
    expect(autoDraftThisWeek([row("2026-11-19")], "2026-11-20")).toBeDefined();
  });
});

describe("끄는 스위치", () => {
  it("기본은 켜져 있다", () => {
    expect(autoDraftEnabled({})).toBe(true);
    expect(autoDraftEnabled({ ARTICLE_WEEKLY: "", ARTICLE_DAILY: "" })).toBe(true);
  });

  it("ARTICLE_WEEKLY=0이면 끈다", () => {
    expect(autoDraftEnabled({ ARTICLE_WEEKLY: "0" })).toBe(false);
  });

  it("옛 이름 ARTICLE_DAILY=0도 계속 끈다", () => {
    expect(autoDraftEnabled({ ARTICLE_DAILY: "0" })).toBe(false);
  });

  it("새 이름이 있으면 새 이름을 따른다", () => {
    expect(autoDraftEnabled({ ARTICLE_WEEKLY: "1", ARTICLE_DAILY: "0" })).toBe(true);
  });
});
