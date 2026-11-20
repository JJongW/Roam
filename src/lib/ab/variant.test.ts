import { beforeEach, describe, expect, it } from "vitest";
import { abVariant, hash32, pickVariant } from "./variant";

describe("A/B 나누기", () => {
  beforeEach(() => window.localStorage.clear());

  it("같은 씨앗과 이름이면 같은 쪽", () => {
    expect(pickVariant("abc", "x", ["a", "b"])).toBe(pickVariant("abc", "x", ["a", "b"]));
  });

  it("씨앗이 여럿이면 양쪽이 다 나온다", () => {
    const seen = new Set(
      Array.from({ length: 50 }, (_, i) => pickVariant(`seed-${i}`, "x", ["a", "b"])),
    );
    expect(seen).toEqual(new Set(["a", "b"]));
  });

  it("hash32는 32비트 양의 정수", () => {
    const h = hash32("roam");
    expect(Number.isInteger(h)).toBe(true);
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThan(2 ** 32);
  });

  it("한 번 고른 값은 브라우저에 남고 다시 불러도 같다", () => {
    const v = abVariant("t", ["top", "bottom"] as const);
    expect(window.localStorage.getItem("roam.ab.t")).toBe(v);
    expect(abVariant("t", ["top", "bottom"] as const)).toBe(v);
  });

  it("남은 값이 목록에 없으면 다시 고른다", () => {
    window.localStorage.setItem("roam.ab.t", "gone");
    expect(["top", "bottom"]).toContain(abVariant("t", ["top", "bottom"] as const));
  });
});
