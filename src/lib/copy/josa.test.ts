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
