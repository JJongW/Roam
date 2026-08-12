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

  it("직전과 같은 트리거면 재발화 금지 창(90초) 안에서는 막는다", () => {
    const state = {
      lastSpontaneousAt: 1000,
      lastSpontaneousTrigger: "select",
      actionsSinceLastSpontaneous: 5,
    };
    expect(canSaySpontaneous(state, "select", 1000 + 89_000)).toBe(false);
  });

  it("재발화 금지 창을 넘기고 쿨다운·행동 조건도 만족하면 같은 트리거도 다시 허용", () => {
    const state = {
      lastSpontaneousAt: 1000,
      lastSpontaneousTrigger: "select",
      actionsSinceLastSpontaneous: 5,
    };
    expect(canSaySpontaneous(state, "select", 1000 + 91_000)).toBe(true);
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
