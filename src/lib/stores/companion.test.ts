import { describe, expect, it } from "vitest";
import { canSaySpontaneous } from "./companion";

const fresh = {
  lastSpontaneousAt: null as number | null,
  lastSpontaneousTrigger: null as string | null,
  actionsSinceLastSpontaneous: 0,
};

describe("canSaySpontaneous", () => {
  it("첫 발화는 항상 허용", () => {
    expect(canSaySpontaneous(fresh, "select", 1000)).toBe(true);
  });

  it("직전과 같은 트리거면 연속 금지", () => {
    const state = { ...fresh, lastSpontaneousTrigger: "select" };
    expect(canSaySpontaneous(state, "select", 1000)).toBe(false);
  });

  it("45초 안 지났으면 억제(행동 3회 이상이어도)", () => {
    const state = {
      lastSpontaneousAt: 1000,
      lastSpontaneousTrigger: "select",
      actionsSinceLastSpontaneous: 5,
    };
    expect(canSaySpontaneous(state, "searchHit", 1000 + 44_000)).toBe(false);
  });

  it("45초 지나도 행동 3회 미만이면 억제", () => {
    const state = {
      lastSpontaneousAt: 1000,
      lastSpontaneousTrigger: "select",
      actionsSinceLastSpontaneous: 2,
    };
    expect(canSaySpontaneous(state, "searchHit", 1000 + 46_000)).toBe(false);
  });

  it("45초 지나고 행동 3회 이상 + 다른 트리거면 허용", () => {
    const state = {
      lastSpontaneousAt: 1000,
      lastSpontaneousTrigger: "select",
      actionsSinceLastSpontaneous: 3,
    };
    expect(canSaySpontaneous(state, "searchHit", 1000 + 46_000)).toBe(true);
  });
});
