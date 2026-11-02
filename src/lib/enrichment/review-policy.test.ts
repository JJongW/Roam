import { describe, expect, it } from "vitest";
import {
  reviewPolicy,
  exhibitionTrust,
  exhaustedBooths,
  DEFAULT_POLICY,
  STRICT_POLICY,
  type TrustSample,
} from "./review-policy";
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

  it("근거가 없으면 사람이 아니라 기계에게 돌려보낸다", () => {
    // 2026-10-16에 뒤집었다. 사람 판단 787건에서 no_sources 가 붙은 62건의 승인률은
    // 35%였다 — 검수자가 봐도 웹에 없는 건 없어서 "다시 찾아"라고 쓸 뿐이다.
    const r = reviewPolicy(0.4, [issue("no_sources")], live);
    expect(r.decision).toBe("redraft");
    expect(r.wouldAutoPass).toBe(false);
  });

  it("초안이 스스로 못 찾았다고 적으면 다시 쓴다", () => {
    // 승인률 22%(27건). 예전엔 이 신호 자체가 없어서, 요약에 "브랜드를 찾을 수
    // 없었다"고 적은 초안이 출처 5건을 달고 0.94를 받았다.
    expect(reviewPolicy(0.55, [issue("not_found")], live).decision).toBe("redraft");
  });

  it("해석을 못 붙였으면 점수와 무관하게 다시 쓴다", () => {
    // no_interpretation 승인률 19%.
    expect(reviewPolicy(0.9, [issue("no_interpretation")], live).decision).toBe("redraft");
  });

  it("상투어만 있으면 자동으로 보낸다 — 승인률 89%", () => {
    // 빈말 하나면 1.00-0.25=0.75로 바닥(0.70) 위다. 사람을 부를 만한 신호가 아니다.
    expect(reviewPolicy(0.88, [issue("filler")], live).decision).toBe("auto_pass");
  });

  it("빈말이 신원 안 맞댐과 겹치면 사람이 본다", () => {
    // 0.25+0.10=0.35 → 0.65. 사람이 반려한 자동 승인분이 몰려 있던 조합이다.
    const r = reviewPolicy(0.55, [issue("filler"), issue("unanchored"), issue("single_source")], live);
    expect(r.decision).toBe("review");
    expect(r.reason).toContain("확인 불가가 겹쳤다");
  });
});

describe("reviewPolicy — 자동 통과", () => {
  it("지적 없으면 통과 — 228건 전부 사람이 승인했다", () => {
    expect(reviewPolicy(1.0, [], live).decision).toBe("auto_pass");
  });

  it("확인 불가만 붙었고 바닥(0.70) 위면 통과", () => {
    // unanchored 단독은 0.90. 274건 중 73%를 사람이 승인했는데 전량 사람 몫이었다 —
    // 그게 검수 적체의 최대 원인이었다.
    expect(reviewPolicy(0.9, [issue("unanchored")], live).decision).toBe("auto_pass");
  });

  it("바닥 아래면 사람이 본다", () => {
    expect(reviewPolicy(0.55, [issue("single_source"), issue("filler")], live).decision)
      .toBe("review");
  });

  it("분류 되읽기는 자동으로 보낸다 — 승인률 90%", () => {
    expect(reviewPolicy(0.7, [issue("category_readback")], live).decision).toBe("auto_pass");
  });

  it("아직 믿을지 정하지 않은 전시는 0.95를 요구한다", () => {
    // 초안 품질은 전시마다 다르다. 자동 승인분의 새어나감이 마곡리빙마켓은 9.9%,
    // DDP·SIF·가구쇼는 0%였다 — 그래서 전시마다 앞부분을 보고 문턱을 정한다.
    expect(reviewPolicy(0.9, [issue("unanchored")], STRICT_POLICY).decision).toBe("review");
    expect(reviewPolicy(0.96, [], STRICT_POLICY).decision).toBe("auto_pass");
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

describe("exhibitionTrust — 전시마다 믿을지 정한다", () => {
  const row = (
    i: number,
    status: TrustSample["status"],
    issues: QualityIssue[] = [issue("unanchored")],
    confidence = 0.9,
  ): TrustSample => ({
    confidence,
    issues,
    status,
    createdAt: `2026-10-${String(i + 1).padStart(2, "0")}T00:00:00Z`,
  });

  it("표본이 덜 찼으면 엄격하게 본다", () => {
    const t = exhibitionTrust([...Array(10)].map((_, i) => row(i, "approved")));
    expect(t.phase).toBe("sampling");
    expect(t.policy).toEqual(STRICT_POLICY);
    expect(t.reason).toContain("10/25");
  });

  it("표본이 차고 승인률이 높으면 나머지를 자동으로 보낸다", () => {
    const t = exhibitionTrust([...Array(30)].map((_, i) => row(i, "approved")));
    expect(t.phase).toBe("trusted");
    expect(t.policy).toEqual(DEFAULT_POLICY);
    expect(t.sampled).toBe(25);
  });

  it("표본 승인률이 낮은 전시는 계속 사람이 본다", () => {
    // 마곡리빙마켓이 이 경우다 — 자동 승인분의 9.9%가 사람이 반려했을 글이었다.
    const t = exhibitionTrust(
      [...Array(30)].map((_, i) => row(i, i % 2 ? "approved" : "rejected")),
    );
    expect(t.phase).toBe("strict");
    expect(t.policy).toEqual(STRICT_POLICY);
  });

  it("일괄 승인은 보정 근거로 세지 않는다 — 사람이 본 게 아니다", () => {
    const bulk = [...Array(30)].map((_, i) => ({
      ...row(i, "approved" as const),
      reviewNote: "일괄 승인(2026-10-16 쌓인 큐 정리)",
    }));
    expect(exhibitionTrust(bulk).phase).toBe("sampling");
    expect(exhibitionTrust(bulk).sampled).toBe(0);
  });

  it("지적 없는 만점짜리는 표본에 넣지 않는다 — 사람 시간을 안 쓴다", () => {
    // 1.00 은 엄격한 문턱에서도 통과한다. 228건 전부 승인이었으니 볼 이유가 없다.
    const t = exhibitionTrust([...Array(30)].map((_, i) => row(i, "approved", [], 1)));
    expect(t.sampled).toBe(0);
    expect(t.phase).toBe("sampling");
  });
});

describe("exhaustedBooths — 기계가 손을 떼는 지점", () => {
  const draft = (
    boothId: string,
    i: number,
    issues: QualityIssue[] = [issue("no_sources")],
  ) => ({ boothId, confidence: 0.4, issues, createdAt: `2026-10-${String(i + 1).padStart(2, "0")}` });

  it("한 번만 썼으면 더 돌린다", () => {
    expect(exhaustedBooths([draft("b1", 0)]).has("b1")).toBe(false);
  });

  it("상한까지 썼는데 아직 근거가 없으면 손을 뗀다", () => {
    expect(exhaustedBooths([draft("b1", 0), draft("b1", 1)]).has("b1")).toBe(true);
  });

  it("마지막 초안이 쓸 만해졌으면 손을 떼지 않는다", () => {
    // 두 번째에 근거를 찾았다면 그건 재초안이 아니라 검수 대상이다.
    const rows = [draft("b1", 0), draft("b1", 1, [issue("unanchored")])];
    expect(exhaustedBooths(rows).has("b1")).toBe(false);
  });

  it("부스마다 따로 센다", () => {
    const out = exhaustedBooths([draft("b1", 0), draft("b1", 1), draft("b2", 2)]);
    expect([...out]).toEqual(["b1"]);
  });
});
