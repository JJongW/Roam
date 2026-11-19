import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import type { Exhibition } from "@/lib/types";

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

import { AdminFairHeader } from "./admin-fair-header";

const fair = (id: string, name: string, startDate: string) =>
  ({ id, name, slug: id, startDate, endDate: startDate }) as unknown as Exhibition;

describe("AdminFairHeader", () => {
  it("제목 아래에 고른 박람회를 적고 선택기를 같은 머리 줄에 둔다", () => {
    const a = fair("a", "새해 준비상점 N.27", "2026-12-01");
    const b = fair("b", "서울일러스트레이션페어", "2026-12-10");
    render(<AdminFairHeader title="분석" exhibitions={[a, b]} exhibition={a} />);
    const header = screen.getByRole("banner");
    expect(screen.getByRole("heading", { name: "분석" })).toBeInTheDocument();
    expect(header).toHaveTextContent("새해 준비상점 N.27 기준이에요");
    const combo = screen.getByRole("combobox", { name: "볼 행사 고르기" });
    expect(header).toContainElement(combo);
  });

  it("행사가 없으면 선택기 없이 비었다고 적는다", () => {
    render(<AdminFairHeader title="분석" exhibitions={[]} exhibition={undefined} />);
    expect(screen.getByRole("banner")).toHaveTextContent("고른 행사가 없어요");
    expect(screen.queryByRole("combobox")).toBeNull();
  });
});
