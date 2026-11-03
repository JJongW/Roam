import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ExhibitionStatusSection } from "./exhibition-status-section";
import type { Exhibition } from "@/lib/types";

function ex(n: number): Exhibition {
  return {
    id: `e${n}`,
    slug: `ex-${n}`,
    name: `행사 ${n}`,
    venue: "COEX",
    description: "설명",
    startDate: "2026-01-0" + ((n % 9) + 1),
    endDate: "2026-01-1" + ((n % 9) + 1),
    mapWidth: 100,
    mapHeight: 100,
    tips: {} as Exhibition["tips"],
    createdAt: "2026-01-01",
  };
}

describe("ExhibitionStatusSection", () => {
  it("진행 중 섹션은 펼친 상태로 시작한다", () => {
    render(
      <ExhibitionStatusSection
        title="진행 중"
        status="ongoing"
        exhibitions={[ex(1), ex(2)]}
      />,
    );
    expect(screen.getByText("행사 1")).toBeInTheDocument();
    expect(screen.getByText("행사 2")).toBeInTheDocument();
  });

  it("지난 행사 섹션은 접힌 상태로 시작한다 — 결정 대상이 아니다", () => {
    render(
      <ExhibitionStatusSection
        title="지난 행사"
        status="ended"
        exhibitions={[ex(1), ex(2)]}
      />,
    );
    expect(screen.queryByText("행사 1")).not.toBeInTheDocument();
    expect(screen.getByText(/지난 행사/)).toBeInTheDocument();
  });

  it("지난 행사 제목을 누르면 펼쳐진다", async () => {
    render(
      <ExhibitionStatusSection
        title="지난 행사"
        status="ended"
        exhibitions={[ex(1), ex(2)]}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /지난 행사/ }));
    expect(screen.getByText("행사 1")).toBeInTheDocument();
  });

  it("행사가 없으면 아무것도 그리지 않는다", () => {
    const { container } = render(
      <ExhibitionStatusSection title="예정" status="upcoming" exhibitions={[]} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
