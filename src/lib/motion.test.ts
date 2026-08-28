import { readFileSync } from "node:fs";
import { join } from "node:path";
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

describe("motion tokens stay in sync with globals.css", () => {
  const css = [
    readFileSync(join(process.cwd(), "src/app/globals.css"), "utf-8"),
    readFileSync(join(process.cwd(), "src/styles/tokens.css"), "utf-8"),
  ].join("\n");

  function cssVar(name: string): string {
    const match = css.match(new RegExp(`--${name}:\\s*([^;]+);`));
    if (!match) throw new Error(`--${name} not found in globals.css`);
    return match[1].trim();
  }

  it("durations match --motion-d1..d6 (ms)", () => {
    for (const [key, seconds] of Object.entries(MOTION_DURATION)) {
      expect(cssVar(`motion-${key}`)).toBe(`${Math.round(seconds * 1000)}ms`);
    }
  });

  it("easings match --motion-ease-*", () => {
    const kebab = (key: string) =>
      key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
    for (const [key, curve] of Object.entries(MOTION_EASE)) {
      expect(cssVar(`motion-ease-${kebab(key)}`)).toBe(
        `cubic-bezier(${curve.join(", ")})`,
      );
    }
  });
});
