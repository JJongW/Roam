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

  it("근거를 못 찾은 건 재조사가 아니라 사람에게 간다", () => {
    // 운영 실측: 승인된 것 중 no_sources가 8건이었다. 재조사로 돌리면 사람이
    // 승인했을 초안을 버리고 요금만 두 배가 된다 — 그렇다고 자동 통과도 아니다.
    const r = reviewPolicy(0.4, [issue("no_sources")], live);
    expect(r.decision).toBe("review");
    expect(r.wouldAutoPass).toBe(false);
  });

  it("확인 불가 지적(근거 외)은 이유를 설명하고 사람에게 보낸다", () => {
    const r = reviewPolicy(0.4, [issue("no_interpretation")], live);
    expect(r.decision).toBe("review");
    expect(r.reason).toContain("글이 나쁘다는 뜻은 아니다");
  });

  it("상투어만 있으면 사람이 본다 — 재조사 아님", () => {
    expect(reviewPolicy(0.7, [issue("filler")], live).decision).toBe("review");
  });
});

describe("reviewPolicy — 자동 통과", () => {
  it("결함 없고 임계(0.95) 이상이면 통과", () => {
    expect(reviewPolicy(0.96, [], live).decision).toBe("auto_pass");
  });

  it("0.80~0.94는 사람이 본다 — 실측 승인률 92%라 8%가 새어나간다", () => {
    expect(reviewPolicy(0.88, [], live).decision).toBe("review");
  });

  it("출처가 없으면 점수가 만점이어도 자동 통과 안 된다", () => {
    // 검수자가 0.85짜리를 반려하며 남긴 말: "거짓정보만큼 위험한 게 없음".
    // 게이트는 형식을 보지 사실 여부를 못 본다.
    const r = reviewPolicy(1.0, [issue("no_sources")], live);
    expect(r.decision).toBe("review");
    expect(r.wouldAutoPass).toBe(false);
    expect(r.reason).toContain("근거가 확인되지 않았다");
  });

  it("점수가 높아도 결함이 있으면 통과시키지 않는다", () => {
    // 0.9인데 로미 발화에 가치 이름이 들어간 경우.
    const r = reviewPolicy(0.9, [issue("value_word_in_voice")], live);
    expect(r.decision).toBe("redraft");
  });

  it("임계 미만이면 사람이 본다", () => {
    expect(reviewPolicy(0.94, [], live).decision).toBe("review");
  });
});

describe("reviewPolicy — 그림자 모드", () => {
  // 기본값은 2026-09-07부터 shadow:false다(실측 41/41 승인). 되돌릴 때를 위해
  // 기능은 남겨두고, 여기서는 명시적으로 켜서 검사한다.
  const shadow = { ...DEFAULT_POLICY, shadow: true };

  it("자동 통과 대상이어도 실제로는 사람에게 보낸다", () => {
    const r = reviewPolicy(0.98, [], shadow);
    expect(r.decision).toBe("review");
    // 다만 "통과했을 것"이라는 표시는 남는다 — 이게 보정의 근거가 된다.
    expect(r.wouldAutoPass).toBe(true);
    expect(r.reason).toContain("그림자 모드");
  });

  it("그림자여도 재조사 판정은 그대로다", () => {
    expect(reviewPolicy(0.3, [issue("name_only")], shadow).decision).toBe(
      "redraft",
    );
  });

  it("기본값은 이제 자동 통과가 켜져 있다", () => {
    expect(DEFAULT_POLICY.shadow).toBe(false);
    expect(reviewPolicy(0.98, []).decision).toBe("auto_pass");
  });
});
