import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BoothCardV2 } from "./booth-card";
import { isHearted, useVisitStore } from "@/lib/stores/visit";
import { label, system } from "@/lib/copy/v1";
import type { BoothListItem } from "@/lib/types";

vi.mock("@/lib/stores/visit", async (orig) => {
  const mod = await orig<typeof import("@/lib/stores/visit")>();
  return { ...mod, pushNote: vi.fn(async () => {}) };
});

const booth = {
  id: "b1",
  name: "디어더스레드",
  code: "J-19",
  categoryId: "c1",
  description: "",
  tags: [],
} as unknown as BoothListItem;

beforeEach(() => {
  useVisitStore.setState({ records: {} });
});

describe("지도 부스 카드 확인 알림(2026-11-27 Ted, 위 토스트)", () => {
  it("다녀왔어요를 끄면 카드에 스낵바를 두지 않고 onConfirm으로 넘긴다", async () => {
    useVisitStore.getState().setVisited("b1", true);
    const onConfirm = vi.fn();
    render(
      <BoothCardV2 booth={booth} categories={[]} exhibitionSlug="sdf" onConfirm={onConfirm} />,
    );
    await userEvent.click(screen.getByRole("button", { name: new RegExp(label.visited) }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm.mock.calls[0][0]).toMatchObject({
      message: system.visitRemoved(booth.name, false),
      actionLabel: label.undo,
    });
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("하트를 빼면 onConfirm으로 넘기고 되돌리기가 기록을 돌린다", async () => {
    useVisitStore.getState().setHeart("b1", true);
    const onConfirm = vi.fn();
    render(
      <BoothCardV2 booth={booth} categories={[]} exhibitionSlug="sdf" onConfirm={onConfirm} />,
    );
    await userEvent.click(screen.getByRole("button", { name: label.heartRemove }));
    const s = onConfirm.mock.calls[0][0];
    expect(s.message).toBe(system.heartRemoved(booth.name));
    expect(screen.queryByRole("status")).toBeNull();
    s.onAction();
    expect(isHearted(useVisitStore.getState().records.b1)).toBe(true);
  });

  it("onConfirm이 없으면 예전처럼 카드 위에 스낵바를 둔다", async () => {
    useVisitStore.getState().setVisited("b1", true);
    render(<BoothCardV2 booth={booth} categories={[]} exhibitionSlug="sdf" />);
    await userEvent.click(screen.getByRole("button", { name: new RegExp(label.visited) }));
    expect(screen.getByRole("status").textContent).toContain(booth.name);
  });
});
