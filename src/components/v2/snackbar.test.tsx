import { describe, expect, it } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { QueuedSnackbar, Snackbar, queueSnackbar, takeQueuedSnackbar } from "./snackbar";

describe("v2 스낵바", () => {
  it("맡겨 둔 문구는 한 번만 꺼낸다(15-10, 15-13)", () => {
    queueSnackbar("로그아웃했어요");
    expect(takeQueuedSnackbar()).toBe("로그아웃했어요");
    expect(takeQueuedSnackbar()).toBeNull();
  });

  it("도착한 화면이 열리면 맡겨 둔 문구를 띄운다", () => {
    queueSnackbar("계정을 지웠어요");
    act(() => {
      render(<QueuedSnackbar />);
    });
    expect(screen.getByRole("status").textContent).toContain("계정을 지웠어요");
  });

  it("행동 단추는 누르는 영역 44(min-h-v2-x11, min-w-v2-x11)", () => {
    render(
      <Snackbar
        state={{ key: 1, message: "하트를 뺐어요", actionLabel: "되돌리기", onAction: () => {} }}
        onClose={() => {}}
      />,
    );
    const btn = screen.getByRole("button", { name: "되돌리기" });
    expect(btn.className).toContain("min-h-v2-x11");
    expect(btn.className).toContain("min-w-v2-x11");
  });

  it("행동 글자는 반전 바탕용 브랜드 글자, 그림자는 s3(Roam-design #63, 11-25)", () => {
    render(
      <Snackbar
        state={{ key: 1, message: "하트를 뺐어요", actionLabel: "되돌리기", onAction: () => {} }}
        onClose={() => {}}
      />,
    );
    const btn = screen.getByRole("button", { name: "되돌리기" });
    expect(btn.className).toContain("text-v2-fg-brand-inverted");
    expect(btn.className).not.toContain("text-v2-fg-on-neutral-solid");
    const bar = screen.getByRole("status");
    expect(bar.className).toContain("shadow-v2-s3");
    expect(bar.className).toContain("min-h-v2-x12");
  });
});
