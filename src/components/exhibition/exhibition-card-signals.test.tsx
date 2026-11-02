import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { ExhibitionCard } from "./exhibition-card";
import type { Exhibition } from "@/lib/types";

const ex = {
  id: "e1",
  slug: "sibf-2026",
  name: "2026 서울국제도서전",
  venue: "COEX A홀",
  description: "책과 출판을 다루는 전시",
  startDate: "2026-06-17",
  endDate: "2026-06-21",
  coverImageUrl: "/poster.webp",
  mapWidth: 100,
  mapHeight: 100,
  tips: {} as Exhibition["tips"],
  createdAt: "2026-01-01",
} satisfies Exhibition;

function text(signals?: {
  boothCount: number;
  groundedCount: number;
  daysLeft: number | null;
}) {
  const { container } = render(
    <ExhibitionCard exhibition={ex} status="ongoing" signals={signals} />,
  );
  return container.textContent ?? "";
}

describe("ExhibitionCard signals", () => {
  it("세 절을 모두 그리고 사전 키가 그대로 새지 않는다", () => {
    const out = text({ boothCount: 186, groundedCount: 176, daysLeft: 3 });
    expect(out).toContain("부스 186곳");
    expect(out).toContain("3일 남음");
    expect(out).toContain("로미가 아는 곳 176");
    expect(out).not.toMatch(/home\.signal/);
  });

  it("daysLeft 1은 오늘까지", () => {
    const out = text({ boothCount: 186, groundedCount: 176, daysLeft: 1 });
    expect(out).toContain("오늘까지");
    expect(out).not.toContain("1일 남음");
  });

  it("groundedCount 0이면 준비도 절을 뺀다", () => {
    const out = text({ boothCount: 186, groundedCount: 0, daysLeft: 3 });
    expect(out).not.toContain("로미가 아는 곳");
    expect(out).toContain("부스 186곳");
  });

  it("전부 비면 신호 줄을 그리지 않는다", () => {
    const out = text({ boothCount: 0, groundedCount: 0, daysLeft: null });
    expect(out).not.toContain("부스");
  });

  it("signals가 없으면 신호 줄이 없다", () => {
    expect(text()).not.toContain("부스");
  });
});
