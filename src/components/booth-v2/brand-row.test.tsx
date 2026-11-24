import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { BrandRow } from "./brand-row";
import { useAuthStore } from "@/lib/stores/auth";

const LOGGED_IN = "부스 하트를 남기면 이 브랜드의 다음 박람회 참가도 알려 드려요";
const LOGGED_OUT = "로그인하면 다음 박람회 소식을 알려 드려요";

beforeEach(() => {
  useAuthStore.setState({ user: null });
});

describe("BrandRow(UI 23 Q1 C)", () => {
  it("로그인한 분에게는 부스 하트가 브랜드 알림으로 이어진다고 말하고, 누를 단추가 없다", () => {
    useAuthStore.setState({ user: { id: "u1" } as never });
    render(<BrandRow name="꽃잠" />);
    expect(screen.getByText("꽃잠")).toBeInTheDocument();
    expect(screen.getByText(LOGGED_IN)).toBeInTheDocument();
    expect(screen.queryByText(LOGGED_OUT)).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("로그인 전에는 로그인하면 알려 드린다고만 말하고, 로그인 단추를 새로 두지 않는다", () => {
    render(<BrandRow name="꽃잠" />);
    expect(screen.getByText(LOGGED_OUT)).toBeInTheDocument();
    expect(screen.queryByText(LOGGED_IN)).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });
});
