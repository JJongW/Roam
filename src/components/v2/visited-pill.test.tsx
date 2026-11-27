import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { VisitedPill } from "./visited-pill";
import { label } from "@/lib/copy/v1";

/** "다녀왔어요" 알약 아이콘 = 발자국(UI 26-I1, 2026-11-27 Ted). 끔은 선, 켬은 채움. 체크는 쓰지 않는다. */
describe("다녀왔어요 알약 아이콘", () => {
  it("끔은 선 발자국", () => {
    render(<VisitedPill on={false} onToggle={() => {}} />);
    const btn = screen.getByRole("button", { name: label.visited });
    const icon = btn.querySelector(".lucide-footprints");
    expect(icon).not.toBeNull();
    expect(icon!.getAttribute("fill")).toBe("none");
    expect(btn.querySelector(".lucide-check")).toBeNull();
  });

  it("켬은 채운 발자국", () => {
    render(<VisitedPill on onToggle={() => {}} />);
    const btn = screen.getByRole("button", { name: label.visited });
    expect(btn.getAttribute("aria-pressed")).toBe("true");
    const icon = btn.querySelector(".lucide-footprints");
    expect(icon).not.toBeNull();
    expect(icon!.getAttribute("fill")).toBe("currentColor");
    expect(btn.querySelector(".lucide-check")).toBeNull();
  });
});
