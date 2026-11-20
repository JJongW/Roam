import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
const put = vi.fn().mockResolvedValue({});
const del = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/api/client", () => ({
  api: { put: (...a: unknown[]) => put(...a), del: (...a: unknown[]) => del(...a), get: vi.fn() },
}));
const track = vi.fn();
vi.mock("@/lib/analytics/app-track", async (orig) => ({
  ...(await orig<typeof import("@/lib/analytics/app-track")>()),
  track: (...a: unknown[]) => track(...a),
}));

import { BrandRow } from "./brand-row";
import { useAuthStore } from "@/lib/stores/auth";
import { useBrandHeartStore } from "@/lib/stores/brand-hearts";
import { system } from "@/lib/copy/v1";

function setup(signedIn: boolean) {
  useAuthStore.setState({ user: signedIn ? ({ id: "u1" } as never) : null });
  const show = vi.fn();
  render(<BrandRow exhibitorId="ex-1" name="꽃잠" exhibitionSlug="fair" show={show} />);
  return show;
}

beforeEach(() => {
  localStorage.clear();
  useBrandHeartStore.setState({ hearts: {}, pending: {}, loaded: false });
  put.mockClear();
  del.mockClear();
  track.mockClear();
});

describe("BrandRow(UI 19 A안)", () => {
  it("브랜드 이름과 '이 브랜드 하트'를 보이고, 로그인 전 설명을 쓴다(19-A1, 19-A3)", () => {
    setup(false);
    expect(screen.getByText("꽃잠")).toBeInTheDocument();
    expect(screen.getByText("이 브랜드 하트")).toBeInTheDocument();
    expect(screen.getByText(system.brandRowLoggedOut)).toBeInTheDocument();
  });

  it("로그인한 분이 남기면 계정에 올리고 19-A2 스낵바를 띄운다", async () => {
    const show = setup(true);
    expect(screen.getByText(system.brandRowLoggedIn)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "브랜드 하트 남기기" }));
    expect(put).toHaveBeenCalledWith("/api/me/brand-hearts/ex-1");
    expect(show).toHaveBeenCalledWith({ message: system.brandHeartLeft("꽃잠") });
    expect(track).toHaveBeenCalledWith("brand_heart_add", expect.objectContaining({ props: expect.objectContaining({ from: "detail_row" }) }));
    expect(screen.getByRole("button", { name: "브랜드 하트 빼기" })).toBeInTheDocument();
  });

  it("빼면 확인 없이 바로 빠지고 되돌리기 스낵바를 준다(19-A4)", async () => {
    const show = setup(true);
    await userEvent.click(screen.getByRole("button", { name: "브랜드 하트 남기기" }));
    await userEvent.click(screen.getByRole("button", { name: "브랜드 하트 빼기" }));
    expect(del).toHaveBeenCalledWith("/api/me/brand-hearts/ex-1");
    const last = show.mock.calls.at(-1)![0];
    expect(last.message).toBe(system.brandHeartRemoved("꽃잠"));
    expect(last.actionLabel).toBe("되돌리기");
    act(() => last.onAction());
    expect(useBrandHeartStore.getState().hearts["ex-1"]).toBeTruthy();
    expect(track).toHaveBeenCalledWith("brand_heart_undo", expect.anything());
  });

  it("로그인 전에는 기기에만 남기고 계정에 올리지 않는다", async () => {
    setup(false);
    await userEvent.click(screen.getByRole("button", { name: "브랜드 하트 남기기" }));
    expect(put).not.toHaveBeenCalled();
    expect(useBrandHeartStore.getState().pending).toEqual({ "ex-1": "add" });
  });

  it("브라우저에 못 쓰면 19-A5 실패 띠와 다시 시도를 준다", async () => {
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("full");
    });
    const show = setup(true);
    await userEvent.click(screen.getByRole("button", { name: "브랜드 하트 남기기" }));
    expect(show).toHaveBeenCalledWith(expect.objectContaining({ message: system.brandHeartSaveFailed, actionLabel: "다시 시도" }));
    expect(put).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
