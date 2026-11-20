import { describe, expect, it } from "vitest";
import { hasFinalConsonant, iyeyo } from "./josa";

describe("iyeyo", () => {
  it("한글 받침으로 가린다", () => {
    expect(iyeyo("A홀")).toBe("A홀이에요");
    expect(iyeyo("코엑스 C홀")).toBe("코엑스 C홀이에요");
    expect(iyeyo("제2전시장 앞 로비")).toBe("제2전시장 앞 로비예요");
  });
  it("숫자와 영문은 읽는 소리로 가린다", () => {
    expect(iyeyo("B1")).toBe("B1이에요");
    expect(iyeyo("Hall 2")).toBe("Hall 2예요");
    expect(iyeyo("Hall A")).toBe("Hall A예요");
    expect(iyeyo("Hall M")).toBe("Hall M이에요");
  });
  it("빈 말은 받침 없음으로", () => {
    expect(hasFinalConsonant("")).toBe(false);
  });
});

describe("euroRo", () => {
  it("받침 없거나 ㄹ이면 로, 나머지는 으로", async () => {
    const { euroRo } = await import("./josa");
    expect(euroRo("나무")).toBe("로");
    expect(euroRo("돌과풀")).toBe("로");
    expect(euroRo("꽃잠")).toBe("으로");
    expect(euroRo("A13")).toBe("으로");
    expect(euroRo("B1")).toBe("로");
    expect(euroRo("Hall")).toBe("로");
  });
});

describe("iGa", () => {
  it("받침이 있으면 이, 없으면 가", async () => {
    const { iGa } = await import("./josa");
    expect(iGa("새해준비상점 2026")).toBe("이");
    expect(iGa("페어")).toBe("가");
    expect(iGa("꽃잠")).toBe("이");
  });
});
