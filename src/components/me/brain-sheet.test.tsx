import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BrainSheet } from "./brain-sheet";
import { api } from "@/lib/api/client";
import type { UserBrain } from "@/lib/types";

const brain = (over: Partial<UserBrain> = {}): UserBrain => ({
  userId: "u1",
  version: 1,
  updatedAt: "",
  literacy: { overall: 0.4, byTheme: {}, visitsCount: 2, boothsSeenCount: 9 },
  interests: [
    {
      key: "discovery",
      label: "발견",
      confidence: 0.8,
      signals: { explicit: 3, implicit: 1, negative: 0 },
      firstSeenAt: "",
      lastSeenAt: "",
      trend: "up",
    },
  ],
  mutedSlugs: [],
  preferences: {},
  goals: [],
  visits: [],
  health: { lastDistilledAt: "", decayHalfLifeDays: 90 },
  ...over,
});

describe("BrainSheet 관심 고치기", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("고치기 모드에서 8가치가 전부 뜬다 — 뺄 것도 보여야 뺄 수 있다", async () => {
    vi.spyOn(api, "get").mockResolvedValue({ data: brain() });
    const user = userEvent.setup();
    render(<BrainSheet open onClose={() => {}} />);
    await waitFor(() => screen.getByText("발견"));
    await user.click(screen.getByRole("button", { name: /고치기|Edit/i }));
    // Sheet는 Radix Portal이라 document.body에 렌더된다 — RTL의 container 밖.
    expect(
      document.body.querySelectorAll('[data-testid^="value-toggle-"]'),
    ).toHaveLength(8);
  });

  it("켜진 가치를 누르면 muted:true로 PUT 한다", async () => {
    vi.spyOn(api, "get").mockResolvedValue({ data: brain() });
    const put = vi.spyOn(api, "put").mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<BrainSheet open onClose={() => {}} />);
    await waitFor(() => screen.getByText("발견"));
    await user.click(screen.getByRole("button", { name: /고치기|Edit/i }));
    await user.click(screen.getByTestId("value-toggle-discovery"));
    expect(put).toHaveBeenCalledWith("/api/me/values/discovery", {
      muted: true,
    });
  });

  it("꺼진 가치를 누르면 muted:false로 PUT 한다", async () => {
    vi.spyOn(api, "get").mockResolvedValue({
      data: brain({ mutedSlugs: ["goods"] }),
    });
    const put = vi.spyOn(api, "put").mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<BrainSheet open onClose={() => {}} />);
    await waitFor(() => screen.getByText("발견"));
    await user.click(screen.getByRole("button", { name: /고치기|Edit/i }));
    await user.click(screen.getByTestId("value-toggle-goods"));
    expect(put).toHaveBeenCalledWith("/api/me/values/goods", { muted: false });
  });
});
