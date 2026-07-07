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
  it("summary(라벨) 기반 + 충분히 즐겼다 감각, raw slug 노출 안 함", () => {
    const t = fallbackNarrative(
      digest({ summary: "3개 부스 관람 · 주로 문학" }),
    );
    expect(t).toContain("3개 부스 관람 · 주로 문학");
    expect(t).toContain("충분히 즐긴");
    expect(t).not.toContain("lit"); // slug 미노출
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
