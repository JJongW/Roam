import { describe, expect, it } from "vitest";
import { labelWords, layoutBoothLabel } from "./booth-label";

// iOS `BoothLabelTests`와 같은 사례 — 두 플랫폼이 같은 이름을 같은 줄로 그려야 한다.
describe("부스 이름 줄바꿈", () => {
  it("띄어쓰기와 여는 괄호 앞에서 나눈다", () => {
    expect(labelWords("태강(엘리루카클리너)")).toEqual(["태강", "(엘리루카클리너)"]);
    expect(labelWords("오늘의 집  가구")).toEqual(["오늘의", "집", "가구"]);
    expect(labelWords("(주)한샘")).toEqual(["(주)한샘"]);
  });

  it("한 줄에 들어가면 기준 크기 그대로 한 줄이다", () => {
    expect(layoutBoothLabel("한샘", 10, 60, 60, true)).toEqual({ lines: ["한샘"], fontSize: 10 });
  });

  it("좁으면 글자를 줄이기 전에 어절 단위로 줄을 바꾼다", () => {
    expect(layoutBoothLabel("오늘의 집 가구", 10, 50, 60, true)).toEqual({
      lines: ["오늘의 집", "가구"],
      fontSize: 10,
    });
  });

  it("괄호 앞에서 붙여 쓴 이름은 괄호 앞에서 끊는다", () => {
    expect(layoutBoothLabel("태강(엘리루카클리너)", 8, 80, 60, true)).toEqual({
      lines: ["태강", "(엘리루카클리너)"],
      fontSize: 8,
    });
  });

  it("어절 하나가 한 줄보다 길 때만 글자를 줄인다 — 어절 안에서는 끊지 않는다", () => {
    const l = layoutBoothLabel("엘리루카클리너", 10, 50, 60, false);
    expect(l.lines).toEqual(["엘리루카클리너"]);
    expect(l.fontSize).toBeLessThan(10);
    expect(l.fontSize).toBeGreaterThanOrEqual(5);
  });

  it("절반으로 줄여도 안 들어가면 그때만 끊고, 넘치는 줄은 …", () => {
    const l = layoutBoothLabel("가나다라마바사아자차카타파하", 10, 25, 14, false);
    expect(l.fontSize).toBe(5);
    expect(l.lines).toHaveLength(2);
    expect(l.lines[1].endsWith("…")).toBe(true);
  });
});
