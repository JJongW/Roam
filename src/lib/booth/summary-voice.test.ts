import { describe, it, expect } from "vitest";
import { hasHamnida, normalizeSummaryVoice } from "@/lib/booth/summary-voice";

describe("normalizeSummaryVoice", () => {
  it("합니다체 문장 끝을 해요체로 바꾼다", () => {
    expect(normalizeSummaryVoice("전통주를 빚습니다.")).toBe("전통주를 빚어요.");
    expect(normalizeSummaryVoice("캐릭터 소품을 만듭니다.")).toBe("캐릭터 소품을 만들어요.");
    expect(normalizeSummaryVoice("와인을 수입합니다.")).toBe("와인을 수입해요.");
    expect(normalizeSummaryVoice("시음도 됩니다.")).toBe("시음도 돼요.");
  });

  it("받침에 따라 이에요와 예요를 고른다", () => {
    expect(normalizeSummaryVoice("지역 양조장입니다.")).toBe("지역 양조장이에요.");
    expect(normalizeSummaryVoice("와인 수입사입니다.")).toBe("와인 수입사예요.");
  });

  it("가운뎃점은 쉼표로 바꾼다", () => {
    expect(normalizeSummaryVoice("와인·위스키를 들여와요.")).toBe("와인, 위스키를 들여와요.");
  });

  it("이미 해요체면 그대로 둔다", () => {
    expect(normalizeSummaryVoice("도자기 잔을 선보여요.")).toBe("도자기 잔을 선보여요.");
  });

  it("모르는 합니다체 끝이 남으면 비운다", () => {
    expect(normalizeSummaryVoice("새로운 길을 엮습니다.")).toBe("");
  });

  it("hasHamnida는 문장 끝 합니다체를 찾는다", () => {
    expect(hasHamnida("만듭니다.")).toBe(true);
    expect(hasHamnida("만들어요.")).toBe(false);
  });
});
