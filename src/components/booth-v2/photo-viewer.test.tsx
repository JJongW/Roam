import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const track = vi.fn();
vi.mock("@/lib/analytics/app-track", async (orig) => ({
  ...(await orig<typeof import("@/lib/analytics/app-track")>()),
  track: (...a: unknown[]) => track(...a),
}));

import { PhotoViewer } from "./photo-viewer";

const images = ["/a.jpg", "/b.jpg", "/c.jpg"];

describe("PhotoViewer (UI 4-03)", () => {
  it("누른 사진 번호부터 알약에 보이고 모든 사진을 담는다", () => {
    render(<PhotoViewer images={images} start={1} name="꽃잠" boothId="b1" onClose={() => {}} />);
    expect(screen.getByText("2 / 3")).toBeTruthy();
    expect(screen.getAllByRole("img")).toHaveLength(3);
    expect(track).toHaveBeenCalledWith(
      "screen_view",
      expect.objectContaining({ screen: "UI 4-03", props: { start: 2, count: 3 } }),
    );
  });

  it("X와 Esc로 닫는다", async () => {
    const onClose = vi.fn();
    render(<PhotoViewer images={images} start={0} name="꽃잠" boothId="b1" onClose={onClose} />);
    await userEvent.click(screen.getByRole("button", { name: "닫기" }));
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("닫으면 페이지 스크롤 잠금을 푼다", () => {
    const { unmount } = render(
      <PhotoViewer images={images} start={0} name="꽃잠" boothId="b1" onClose={() => {}} />,
    );
    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    expect(document.body.style.overflow).toBe("");
  });
});
