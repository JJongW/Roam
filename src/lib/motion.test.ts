import { describe, expect, it } from "vitest";
import { MOTION_DURATION, MOTION_EASE } from "./motion";

describe("motion tokens", () => {
  it("duration 6단계가 초 단위로 정확히 존재한다", () => {
    expect(MOTION_DURATION).toEqual({
      d1: 0.05,
      d2: 0.1,
      d3: 0.15,
      d4: 0.2,
      d5: 0.25,
      d6: 0.3,
    });
  });

  it("easing 6종이 4개 숫자 큐빅베지어 배열이다", () => {
    const keys = [
      "linear",
      "functional",
      "enter",
      "exit",
      "enterExpressive",
      "exitExpressive",
    ] as const;
    for (const key of keys) {
      expect(MOTION_EASE[key]).toHaveLength(4);
    }
    expect(MOTION_EASE.linear).toEqual([0, 0, 1, 1]);
  });
});
