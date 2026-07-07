import { describe, expect, it } from "vitest";
import type { VisitDigest } from "@/lib/types";
import { buildRecapPrompt, fallbackNarrative } from "./recap";

const digest = (p: Partial<VisitDigest> = {}): VisitDigest => ({
  exhibitionId: "e1",
  visitId: "r1",
  date: "2026-07-07T00:00:00Z",
  boothsVisited: ["A1", "A2", "A3"],
  themesEngaged: ["lit", "art"],
  highlights: [],
  summary: "3개 부스 관람",
  ...p,
});

describe("fallbackNarrative", () => {
  it("부스 수 + 테마 + 충분히 즐겼다 감각", () => {
    const t = fallbackNarrative(digest());
    expect(t).toContain("3곳");
    expect(t).toContain("lit·art");
    expect(t).toContain("충분히 즐긴");
  });
  it("테마 없으면 테마 절 생략", () => {
    const t = fallbackNarrative(digest({ themesEngaged: [] }));
    expect(t).not.toContain("중심으로");
    expect(t).toContain("3곳");
  });
});

describe("buildRecapPrompt", () => {
  it("숫자 자랑 금지 규칙 + 테마·부스수 포함", () => {
    const p = buildRecapPrompt(digest(), "2026 서울국제도서전");
    expect(p).toContain("성취·숫자 자랑 금지");
    expect(p).toContain("lit, art");
    expect(p).toContain("방문 부스 수: 3");
    expect(p).toContain("2026 서울국제도서전");
  });
});
