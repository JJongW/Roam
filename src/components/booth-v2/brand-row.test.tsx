import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { BrandRow } from "./brand-row";
import { useAuthStore } from "@/lib/stores/auth";

const LOGGED_IN = "부스 하트를 남기면 이 브랜드의 다음 박람회 참가도 알려 드려요";
const LOGGED_OUT = "로그인하면 다음 박람회 소식을 알려 드려요";
const EMPTY = "브랜드 소개가 아직 없어요";

beforeEach(() => {
  useAuthStore.setState({ user: null });
});

describe("BrandRow(UI 24 Q1 A, 소개와 브랜드 칸을 한 칸으로)", () => {
  it("로그인한 분에게는 부스 하트가 브랜드 알림으로 이어진다고 말하고, 누를 단추가 없다", () => {
    useAuthStore.setState({ user: { id: "u1" } as never });
    render(<BrandRow name="꽃잠" intro="종이로 꽃을 접어요" />);
    expect(screen.getByText("꽃잠")).toBeInTheDocument();
    expect(screen.getByText(LOGGED_IN)).toBeInTheDocument();
    expect(screen.queryByText(LOGGED_OUT)).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("로그인 전에는 로그인하면 알려 드린다고만 말하고, 로그인 단추를 새로 두지 않는다", () => {
    render(<BrandRow name="꽃잠" intro="종이로 꽃을 접어요" />);
    expect(screen.getByText(LOGGED_OUT)).toBeInTheDocument();
    expect(screen.queryByText(LOGGED_IN)).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("이름 밑에 소개, 맨 아래에 알림 문구 순서다. 브랜드가 쓴 원문은 고치지 않는다", () => {
    const intro = "핸드 크래프트 기반의 주얼리 피스를 통해 · 작은 소원을 전합니다.";
    render(<BrandRow name="키쉬케이브" intro={intro} />);
    const box = screen.getByRole("region", { name: "브랜드" });
    const text = box.textContent ?? "";
    expect(text.indexOf("키쉬케이브")).toBeLessThan(text.indexOf(intro));
    expect(text.indexOf(intro)).toBeLessThan(text.indexOf(LOGGED_OUT));
    expect(screen.queryByText(EMPTY)).toBeNull();
  });

  it("소개가 없으면 '브랜드 소개가 아직 없어요' 한 줄과 알림 문구", () => {
    render(<BrandRow name="컴포지션스튜디오" />);
    expect(screen.getByText(EMPTY)).toBeInTheDocument();
    expect(screen.getByText(LOGGED_OUT)).toBeInTheDocument();
  });
});
