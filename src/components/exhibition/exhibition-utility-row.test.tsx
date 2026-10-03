import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ExhibitionUtilityRow } from "./exhibition-utility-row";

describe("ExhibitionUtilityRow", () => {
  it("지도·메모장·부스 찾기 3칸을 렌더한다", () => {
    render(
      <ExhibitionUtilityRow slug="sibf-2026" showNotes onSearch={() => {}} />,
    );
    expect(screen.getByRole("link", { name: "지도" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "메모장" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "부스 찾기" }),
    ).toBeInTheDocument();
  });

  it("지도·메모장 링크가 전시 slug 경로를 가리킨다", () => {
    render(
      <ExhibitionUtilityRow slug="sibf-2026" showNotes onSearch={() => {}} />,
    );
    expect(screen.getByRole("link", { name: "지도" })).toHaveAttribute(
      "href",
      "/exhibitions/sibf-2026/map",
    );
    expect(screen.getByRole("link", { name: "메모장" })).toHaveAttribute(
      "href",
      "/exhibitions/sibf-2026/notes",
    );
  });

  it("비로그인(showNotes=false)이면 메모장을 숨긴다 — 계정에 묶인 저장이라", () => {
    render(
      <ExhibitionUtilityRow
        slug="sibf-2026"
        showNotes={false}
        onSearch={() => {}}
      />,
    );
    expect(
      screen.queryByRole("link", { name: "메모장" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "지도" })).toBeInTheDocument();
  });

  it("부스 찾기를 누르면 onSearch를 부른다", async () => {
    const onSearch = vi.fn();
    render(
      <ExhibitionUtilityRow slug="sibf-2026" showNotes onSearch={onSearch} />,
    );
    await userEvent.click(screen.getByRole("button", { name: "부스 찾기" }));
    expect(onSearch).toHaveBeenCalledOnce();
  });

  it("세 칸 모두 터치 영역 44px을 유지한다 (Apple HIG 44pt)", () => {
    render(
      <ExhibitionUtilityRow slug="sibf-2026" showNotes onSearch={() => {}} />,
    );
    for (const el of [
      screen.getByRole("link", { name: "지도" }),
      screen.getByRole("link", { name: "메모장" }),
      screen.getByRole("button", { name: "부스 찾기" }),
    ]) {
      expect(el.className).toMatch(/min-h-11/);
    }
  });
});
