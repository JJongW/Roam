import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { SLOW_WAIT_MS, useSlowWait } from "@/lib/hooks/use-slow-wait";

function Probe({ active }: { active: boolean }) {
  return <span>{useSlowWait(active) ? "느림" : "보통"}</span>;
}

describe("useSlowWait", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("기준 시간이 지나야 느리다고 한다", () => {
    render(<Probe active />);
    expect(screen.getByText("보통")).toBeInTheDocument();
    act(() => void vi.advanceTimersByTime(SLOW_WAIT_MS - 1));
    expect(screen.getByText("보통")).toBeInTheDocument();
    act(() => void vi.advanceTimersByTime(1));
    expect(screen.getByText("느림")).toBeInTheDocument();
  });

  it("기다림이 끝나면 바로 꺼진다", () => {
    const { rerender } = render(<Probe active />);
    act(() => void vi.advanceTimersByTime(SLOW_WAIT_MS));
    expect(screen.getByText("느림")).toBeInTheDocument();
    rerender(<Probe active={false} />);
    expect(screen.getByText("보통")).toBeInTheDocument();
  });

  it("다시 기다리기 시작하면 처음부터 센다 — 지난 번 느림이 남아 있으면 안 된다", () => {
    const { rerender } = render(<Probe active />);
    act(() => void vi.advanceTimersByTime(SLOW_WAIT_MS));
    rerender(<Probe active={false} />);
    rerender(<Probe active />);
    expect(screen.getByText("보통")).toBeInTheDocument();
    act(() => void vi.advanceTimersByTime(SLOW_WAIT_MS));
    expect(screen.getByText("느림")).toBeInTheDocument();
  });
});
