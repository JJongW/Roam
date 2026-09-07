import { describe, expect, it } from "vitest";
import { reviewPolicy, DEFAULT_POLICY } from "./review-policy";
import type { QualityIssue } from "./quality-gate";

const issue = (code: string): QualityIssue => ({ code, message: code, weight: 0.1 });
const live = { ...DEFAULT_POLICY, shadow: false };

describe("reviewPolicy — 재조사는 고쳐질 것에만", () => {
  it("다른 부스와 같은 문장이면 다시 물어본다", () => {
    const r = reviewPolicy(0.4, [issue("duplicate_line")], live);
    expect(r.decision).toBe("redraft");
  });

  it("스키마가 어긋나도 다시 물어본다", () => {
    expect(reviewPolicy(0.9, [issue("unknown_value_slug")], live).decision).toBe(
      "redraft",
    );
  });

  it("근거를 못 찾은 건 재조사가 아니다 — 다시 물어봐도 웹에 없는 건 없다", () => {
    // 운영 실측: 승인된 것 중 no_sources가 8건이었다. 이걸 재조사로 돌리면
    // 사람이 승인했을 초안을 버리고 요금만 두 배가 된다.
    const r = reviewPolicy(0.4, [issue("no_sources")], live);
    expect(r.decision).toBe("review");
    expect(r.reason).toContain("글이 나쁘다는 뜻은 아니다");
  });

  it("상투어만 있으면 사람이 본다 — 재조사 아님", () => {
    expect(reviewPolicy(0.7, [issue("filler")], live).decision).toBe("review");
  });
});

describe("reviewPolicy — 자동 통과", () => {
  it("결함 없고 임계 이상이면 통과", () => {
    expect(reviewPolicy(0.88, [], live).decision).toBe("auto_pass");
  });

  it("점수가 높아도 결함이 있으면 통과시키지 않는다", () => {
    // 0.9인데 로미 발화에 가치 이름이 들어간 경우.
    const r = reviewPolicy(0.9, [issue("value_word_in_voice")], live);
    expect(r.decision).toBe("redraft");
  });

  it("임계 미만이면 사람이 본다", () => {
    expect(reviewPolicy(0.79, [], live).decision).toBe("review");
  });
});

describe("reviewPolicy — 그림자 모드", () => {
  it("자동 통과 대상이어도 실제로는 사람에게 보낸다", () => {
    const r = reviewPolicy(0.95, []);
    expect(r.decision).toBe("review");
    // 다만 "통과했을 것"이라는 표시는 남는다 — 이게 보정의 근거가 된다.
    expect(r.wouldAutoPass).toBe(true);
    expect(r.reason).toContain("그림자 모드");
  });

  it("그림자여도 재조사 판정은 그대로다", () => {
    expect(reviewPolicy(0.3, [issue("name_only")]).decision).toBe("redraft");
  });
});
