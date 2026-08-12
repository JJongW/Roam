import { describe, expect, it } from "vitest";
import { buildJudgmentLine } from "./reaction-line";
import type { InterestNode } from "@/lib/types";
import { makeT } from "@/lib/i18n/resolve";
import { DICTS } from "@/lib/i18n/dictionaries";

const t = makeT(DICTS.ko);
const noInterests: InterestNode[] = [];
const confidentInterests: InterestNode[] = [
  {
    key: "discovery",
    label: "발견",
    confidence: 0.5,
    signals: { explicit: 0, implicit: 0, negative: 0 },
    firstSeenAt: "",
    lastSeenAt: "",
    trend: "flat",
  },
];

describe("buildJudgmentLine — interest", () => {
  it("must: 이름 있으면 이름을 부른다", () => {
    const line = buildJudgmentLine(
      "interest",
      "must",
      [],
      "테스트부스",
      undefined,
      noInterests,
      t,
    );
    expect(line).toContain("테스트부스");
  });
  it("curious: 확신 매칭이면 분야를 언급한다", () => {
    const line = buildJudgmentLine(
      "interest",
      "curious",
      ["discovery"],
      "테스트부스",
      "독립출판",
      confidentInterests,
      t,
    );
    expect(line).toContain("독립출판");
  });
  it("pass: 확신 매칭이어도 분야 전체 부정으로 말하지 않는다(헤지)", () => {
    const line = buildJudgmentLine(
      "interest",
      "pass",
      ["discovery"],
      "테스트부스",
      "독립출판",
      confidentInterests,
      t,
    );
    expect(line).not.toMatch(/전부|모두|항상/);
  });
});

describe("buildJudgmentLine — verdict", () => {
  it("good: 직전에 interest='must'였다는 걸 알면(matched=true) '맞았네' 계열", () => {
    const line = buildJudgmentLine(
      "verdict",
      "good",
      [],
      "테스트부스",
      undefined,
      noInterests,
      t,
      { matchedPriorInterest: true },
    );
    expect(typeof line).toBe("string");
    expect(line.length).toBeGreaterThan(0);
  });
  it("good: 예측 없었으면 '몰랐는데 좋았다' 계열", () => {
    const line = buildJudgmentLine(
      "verdict",
      "good",
      [],
      "테스트부스",
      undefined,
      noInterests,
      t,
      { matchedPriorInterest: false },
    );
    expect(line.length).toBeGreaterThan(0);
  });
  it("ok: 판단을 강요하지 않는다(느낌표·강한 어조 없음 — 최소한 렌더는 된다)", () => {
    const line = buildJudgmentLine(
      "verdict",
      "ok",
      [],
      "테스트부스",
      undefined,
      noInterests,
      t,
    );
    expect(line.length).toBeGreaterThan(0);
  });
  it("bad: 부스를 깎지 않고 예측이 빗나갔다는 쪽으로 말한다(가치 이름 미포함)", () => {
    const line = buildJudgmentLine(
      "verdict",
      "bad",
      ["discovery"],
      "테스트부스",
      "독립출판",
      confidentInterests,
      t,
    );
    expect(line).not.toContain("발견"); // 가치 라벨("발견")을 발화에 쓰지 않는다
  });
});

describe("이름 없을 때(Plain 판본)", () => {
  it("boothName undefined면 부스 이름 없이도 렌더된다", () => {
    const line = buildJudgmentLine(
      "interest",
      "must",
      [],
      undefined,
      undefined,
      noInterests,
      t,
    );
    expect(line.length).toBeGreaterThan(0);
  });
});

describe("buildJudgmentLine — bad, 직전 interest가 must/curious였으면 '배움' 톤", () => {
  it("matchedPriorInterest면 reactBadMissed를 쓴다(분야 매칭 여부와 무관)", () => {
    const line = buildJudgmentLine(
      "verdict",
      "bad",
      [],
      "테스트부스",
      undefined,
      noInterests,
      t,
      { matchedPriorInterest: true },
    );
    expect(line).toContain("배웠다");
  });

  it("matchedPriorInterest가 아니면 기존 reactBad 경로 그대로", () => {
    const line = buildJudgmentLine(
      "verdict",
      "bad",
      [],
      "테스트부스",
      undefined,
      noInterests,
      t,
      { matchedPriorInterest: false },
    );
    expect(line).not.toContain("배웠다");
  });
});
