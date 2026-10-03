import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
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

describe("ExhibitionCard — 상태를 형태로", () => {
  it("진행 중은 포스터가 있는 카드로 그린다", () => {
    render(<ExhibitionCard exhibition={ex} status="ongoing" />);
    expect(screen.getByTestId("exhibition-poster")).toBeInTheDocument();
    expect(screen.getByText("들어가기")).toBeInTheDocument();
  });

  it("예정은 포스터 없이 행으로 그린다 — 꽉 찬 포스터는 지금 들어갈 수 있다는 뜻으로 읽힌다", () => {
    render(<ExhibitionCard exhibition={ex} status="upcoming" />);
    expect(screen.queryByTestId("exhibition-poster")).not.toBeInTheDocument();
    expect(screen.getByText("둘러보기")).toBeInTheDocument();
  });

  it("종료는 포스터 없는 행이고 기록 보기로 간다", () => {
    render(<ExhibitionCard exhibition={ex} status="ended" />);
    expect(screen.queryByTestId("exhibition-poster")).not.toBeInTheDocument();
    expect(screen.getByText("기록 보기")).toBeInTheDocument();
  });

  it("상태가 달라도 전시 이름은 항상 읽힌다", () => {
    for (const status of ["ongoing", "upcoming", "ended"] as const) {
      const { unmount } = render(
        <ExhibitionCard exhibition={ex} status={status} />,
      );
      expect(screen.getByText("2026 서울국제도서전")).toBeInTheDocument();
      unmount();
    }
  });

  it("추천 배지는 진행 중에만 붙는다 — 끝난 전시를 취향 근거로 추천하지 않는다", () => {
    const { unmount } = render(
      <ExhibitionCard
        exhibition={ex}
        status="ended"
        recommended
        recommendedLabel="로미 추천"
      />,
    );
    expect(screen.queryByText("로미 추천")).not.toBeInTheDocument();
    unmount();
    render(
      <ExhibitionCard
        exhibition={ex}
        status="ongoing"
        recommended
        recommendedLabel="로미 추천"
      />,
    );
    expect(screen.getByText("로미 추천")).toBeInTheDocument();
  });
});
