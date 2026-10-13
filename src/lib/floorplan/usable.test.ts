import { describe, expect, it } from "vitest";
import { hasUsableLayout } from "@/lib/floorplan/usable";

describe("hasUsableLayout", () => {
  it("좌표가 없으면 그릴 수 없다 — (0,0)만 있는 건 좌표가 아니다", () => {
    expect(hasUsableLayout([])).toBe(false);
    expect(hasUsableLayout([{ x: 0, y: 0 }])).toBe(false);
    expect(
      hasUsableLayout([
        { x: 0, y: 0 },
        { x: 0, y: 0 },
        { x: 0, y: 0 },
      ]),
    ).toBe(false);
  });

  it("전부 같은 자리면 좌표가 없는 것과 같다", () => {
    expect(
      hasUsableLayout([
        { x: 12, y: 30 },
        { x: 12, y: 30 },
      ]),
    ).toBe(false);
  });

  it("서로 다른 자리가 둘이면 그릴 수 있다", () => {
    expect(
      hasUsableLayout([
        { x: 12, y: 30 },
        { x: 40, y: 30 },
      ]),
    ).toBe(true);
  });

  it("한 부스만 멀쩡해도 지도가 되지는 않는다", () => {
    expect(
      hasUsableLayout([
        { x: 0, y: 0 },
        { x: 40, y: 30 },
      ]),
    ).toBe(false);
  });
});
