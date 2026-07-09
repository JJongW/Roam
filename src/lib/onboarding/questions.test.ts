import { describe, expect, it } from "vitest";
import {
  APP_QUESTIONS,
  EXHIBITION_QUESTIONS,
  shouldStopAdaptive,
  tallyAdd,
  topValues,
  type Tally,
} from "@/lib/onboarding/questions";

describe("onboarding questions", () => {
  it("모든 옵션 값이 유효 slug 형태(문자열, 비어있지 않음)", () => {
    for (const q of [...APP_QUESTIONS, ...EXHIBITION_QUESTIONS]) {
      expect(q.options).toHaveLength(4);
      for (const o of q.options) {
        expect(o.values.length).toBeGreaterThan(0);
        expect(o.key).toMatch(/^[a-d]$/);
      }
    }
  });

  it("tallyAdd 누적, topValues 가중 순", () => {
    let t: Tally = {};
    t = tallyAdd(t, { key: "a", values: ["goods"] });
    t = tallyAdd(t, { key: "a", values: ["goods", "trend"] });
    t = tallyAdd(t, { key: "a", values: ["social"] });
    expect(t).toEqual({ goods: 2, trend: 1, social: 1 });
    expect(topValues(t, 2)).toEqual(["goods", expect.any(String)]);
    expect(topValues(t, 3)[0]).toBe("goods");
  });

  it("적응형 종료: 5문항 미만이면 계속", () => {
    expect(shouldStopAdaptive({ goods: 4 }, 3, 8)).toBe(false);
  });

  it("적응형 종료: 5문항+1위 가중 3이상이면 종료", () => {
    expect(shouldStopAdaptive({ goods: 3, trend: 2 }, 5, 8)).toBe(true);
  });

  it("적응형 종료: 5종 가치 커버되면 종료", () => {
    const t = { a: 1, b: 1, c: 1, d: 1, e: 1 };
    expect(shouldStopAdaptive(t, 5, 8)).toBe(true);
  });

  it("적응형 종료: 풀 소진이면 종료", () => {
    expect(shouldStopAdaptive({ goods: 1 }, 8, 8)).toBe(true);
  });
});
