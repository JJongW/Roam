import { describe, expect, it } from "vitest";
import { exhibitionSignals } from "./signals";
import type { BoothListItem, Exhibition } from "@/lib/types";

const ex = {
  id: "e1",
  slug: "sibf-2026",
  name: "도서전",
  venue: "COEX",
  description: "",
  startDate: "2026-06-17",
  endDate: "2026-06-21",
  mapWidth: 100,
  mapHeight: 100,
  tips: {} as Exhibition["tips"],
  createdAt: "2026-01-01",
} satisfies Exhibition;

function booth(
  id: string,
  opts: { summary?: string; facility?: boolean } = {},
) {
  return {
    id,
    exhibitionId: "e1",
    hallId: "h1",
    categoryId: "c1",
    name: id,
    company: "",
    description: "",
    images: [],
    tags: [],
    x: 0,
    y: 0,
    popularity: 0,
    createdAt: "2026-01-01",
    kind: opts.facility ? "facility" : "exhibitor",
    enrichment: opts.summary
      ? ({ summary: opts.summary } as BoothListItem["enrichment"])
      : undefined,
  } as BoothListItem;
}

describe("exhibitionSignals", () => {
  it("부스 수는 facility를 빼고 센다 — 라운지·화장실은 볼거리가 아니다", () => {
    const s = exhibitionSignals(
      ex,
      [booth("a"), booth("b"), booth("c", { facility: true })],
      "2026-06-18",
    );
    expect(s.boothCount).toBe(2);
  });

  it("로미 준비도는 enrichment summary가 있는 부스만 센다", () => {
    const s = exhibitionSignals(
      ex,
      [booth("a", { summary: "에세이 위주" }), booth("b")],
      "2026-06-18",
    );
    expect(s.groundedCount).toBe(1);
  });

  it("빈 문자열 summary는 근거로 세지 않는다 — 없음과 비어 있음을 구별한다", () => {
    const s = exhibitionSignals(
      ex,
      [booth("a", { summary: "   " })],
      "2026-06-18",
    );
    expect(s.groundedCount).toBe(0);
  });

  it("진행 중이면 종료일까지 남은 일수를 준다 (오늘 포함)", () => {
    expect(exhibitionSignals(ex, [], "2026-06-19").daysLeft).toBe(3);
    expect(exhibitionSignals(ex, [], "2026-06-21").daysLeft).toBe(1);
  });

  it("아직 시작 안 했거나 이미 끝났으면 daysLeft는 null이다", () => {
    expect(exhibitionSignals(ex, [], "2026-06-01").daysLeft).toBeNull();
    expect(exhibitionSignals(ex, [], "2026-06-22").daysLeft).toBeNull();
  });
});
