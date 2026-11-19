import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
const select = vi.fn();
vi.mock("./select-exhibition", () => ({
  selectAdminExhibition: (id: string) => select(id),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

import { FairPortfolioLink, FAIR_LANDING_PATH } from "./fair-portfolio-link";

describe("FairPortfolioLink", () => {
  beforeEach(() => {
    push.mockReset();
    select.mockReset();
  });

  it("누르면 그 행사를 선택기와 같은 길로 고르고 분석 화면으로 간다", async () => {
    select.mockResolvedValue(undefined);
    render(<FairPortfolioLink exhibitionId="exh_a">새해 준비상점</FairPortfolioLink>);
    const link = screen.getByRole("link", { name: "새해 준비상점" });
    expect(link).toHaveAttribute("href", FAIR_LANDING_PATH);

    fireEvent.click(link);
    await waitFor(() => expect(push).toHaveBeenCalledWith("/admin/analytics"));
    expect(select).toHaveBeenCalledWith("exh_a");
    expect(select.mock.invocationCallOrder[0]).toBeLessThan(push.mock.invocationCallOrder[0]);
  });

  it("쿠키 저장이 실패하면 이동하지 않는다", async () => {
    select.mockRejectedValue(new Error("boom"));
    render(<FairPortfolioLink exhibitionId="exh_a">새해 준비상점</FairPortfolioLink>);
    fireEvent.click(screen.getByRole("link"));
    await waitFor(() => expect(select).toHaveBeenCalled());
    expect(push).not.toHaveBeenCalled();
  });
});
