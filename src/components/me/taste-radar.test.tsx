import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { TasteRadar } from "./taste-radar";

const label = (s: string) => s;

describe("TasteRadar", () => {
  it("8축 라벨을 모두 그린다 — 값이 없는 축도", () => {
    render(<TasteRadar values={{ discovery: 0.8 }} label={label} />);
    for (const slug of [
      "discovery",
      "experience",
      "goods",
      "social",
      "learning",
      "trend",
      "inspiration",
      "rest",
    ]) {
      expect(screen.getByText(slug)).toBeInTheDocument();
    }
  });

  it("확신 임계(0.25)를 넘는 축과 아닌 축을 다르게 표시한다", () => {
    render(
      <TasteRadar values={{ discovery: 0.8, goods: 0.1 }} label={label} />,
    );
    expect(screen.getByText("discovery").getAttribute("data-strong")).toBe(
      "true",
    );
    expect(screen.getByText("goods").getAttribute("data-strong")).toBe("false");
  });

  it("값이 전부 비어도 축과 그리드는 그린다 — 초기 사용자도 자기 자리를 본다", () => {
    const { container } = render(<TasteRadar values={{}} label={label} />);
    expect(container.querySelector("svg")).not.toBeNull();
    expect(screen.getByText("rest")).toBeInTheDocument();
  });

  it("접근성 이름이 있다", () => {
    render(<TasteRadar values={{}} label={label} />);
    expect(screen.getByRole("img")).toBeInTheDocument();
  });
});
