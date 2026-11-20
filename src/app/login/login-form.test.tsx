import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

let search = new URLSearchParams();
const push = vi.fn();
const back = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, back }),
  useSearchParams: () => search,
}));
const track = vi.fn();
vi.mock("@/lib/analytics/app-track", async (orig) => ({
  ...(await orig<typeof import("@/lib/analytics/app-track")>()),
  track: (...a: unknown[]) => track(...a),
}));

import { LoginForm } from "./login-form";
import { label, system } from "@/lib/copy/v1";

beforeEach(() => {
  push.mockReset();
  back.mockReset();
  track.mockReset();
  sessionStorage.clear();
});

describe("LoginForm (UI 5-04, 5-07)", () => {
  it("처음에는 5-04 제목과 로그인 없이 둘러보기", () => {
    search = new URLSearchParams("next=/me");
    render(<LoginForm />);
    expect(screen.getByRole("heading").textContent).toBe(system.loginSheetTitle);
    expect(screen.getByRole("button", { name: label.browseWithoutLogin })).toBeTruthy();
  });

  it("Google 창에서 취소하고 돌아오면 실패가 아니라 5-04", () => {
    search = new URLSearchParams("login_error=denied");
    render(<LoginForm />);
    expect(screen.getByRole("heading").textContent).toBe(system.loginSheetTitle);
    expect(track).toHaveBeenCalledWith("login_skip", expect.anything());
  });

  it("그 밖의 실패는 5-07, 나중에 할게요는 홈으로", async () => {
    sessionStorage.setItem("roam.login.started", "gate");
    search = new URLSearchParams("login_error=exchange&next=/me");
    render(<LoginForm />);
    expect(screen.getByRole("heading").textContent).toBe(system.loginFailedTitle);
    expect(sessionStorage.getItem("roam.login.started")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: label.later }));
    expect(push).toHaveBeenCalledWith("/");
  });
});
