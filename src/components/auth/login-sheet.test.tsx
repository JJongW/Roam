import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

let pathname = "/exhibitions/fair/map";
const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, push: vi.fn(), back: vi.fn() }),
  usePathname: () => pathname,
}));
const track = vi.fn();
vi.mock("@/lib/analytics/app-track", async (orig) => ({
  ...(await orig<typeof import("@/lib/analytics/app-track")>()),
  track: (...a: unknown[]) => track(...a),
}));

import { LoginSheet } from "./login-sheet";
import { useAuthStore } from "@/lib/stores/auth";
import { label, system } from "@/lib/copy/v1";

beforeEach(() => {
  pathname = "/exhibitions/fair/map";
  track.mockReset();
  act(() => useAuthStore.getState().closeLogin());
});

describe("LoginSheet (UI 5-04, 5-07 지금 화면 위 시트)", () => {
  it("openLogin으로 지금 화면 위에 5-04가 뜨고, 로그인 없이 둘러보기로 닫힌다", async () => {
    render(<LoginSheet />);
    expect(screen.queryByRole("dialog")).toBeNull();
    act(() => useAuthStore.getState().openLogin("heart_snackbar"));
    expect(screen.getByRole("heading").textContent).toBe(system.loginSheetTitle);
    expect(track).toHaveBeenCalledWith(
      "screen_view",
      expect.objectContaining({ props: { source: "heart_snackbar" } }),
    );
    await userEvent.click(screen.getByRole("button", { name: label.browseWithoutLogin }));
    expect(useAuthStore.getState().loginOpen).toBe(false);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("Google에서 실패하고 돌아오면 5-07, 취소면 5-04", () => {
    render(<LoginSheet />);
    act(() => useAuthStore.getState().openLogin("recap", "exchange"));
    expect(screen.getByRole("heading").textContent).toBe(system.loginFailedTitle);
    act(() => useAuthStore.getState().openLogin("recap", "denied"));
    expect(screen.getByRole("heading").textContent).toBe(system.loginSheetTitle);
  });

  it("/login 페이지 위에는 겹치지 않는다", () => {
    pathname = "/login";
    render(<LoginSheet />);
    act(() => useAuthStore.getState().openLogin());
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
