import { describe, expect, it } from "vitest";
import { buildReactionLine } from "@/lib/companion/reaction-line";
import { makeT } from "@/lib/i18n/resolve";
import { DICTS } from "@/lib/i18n/dictionaries";
import type { InterestNode } from "@/lib/types";

const t = makeT(DICTS.ko);

function node(key: string, confidence: number, label: string): InterestNode {
  return {
    key,
    label,
    confidence,
    signals: { explicit: 0, implicit: 0, negative: 0 },
    firstSeenAt: "2026-01-01T00:00:00.000Z",
    lastSeenAt: "2026-01-01T00:00:00.000Z",
    trend: "flat",
  };
}

describe("buildReactionLine", () => {
  it("interested, 매칭 없음 → 기존 문장", () => {
    const result = buildReactionLine(
      "interested",
      ["discovery"],
      "책방나비",
      "일러스트",
      [],
      t,
    );
    expect(result).toBe(t("companion.reactInterested", { booth: "책방나비" }));
  });

  it("interested, 매칭 confidence<0.25 → tentative", () => {
    const result = buildReactionLine(
      "interested",
      ["discovery"],
      "책방나비",
      "일러스트",
      [node("discovery", 0.1, "발견")],
      t,
    );
    expect(result).toBe(
      t("companion.reactInterestedTentative", {
        booth: "책방나비",
        theme: "일러스트",
      }),
    );
  });

  it("interested, 매칭 confidence>=0.25 → confident", () => {
    const result = buildReactionLine(
      "interested",
      ["discovery"],
      "책방나비",
      "일러스트",
      [node("discovery", 0.4, "발견")],
      t,
    );
    expect(result).toBe(
      t("companion.reactInterestedConfident", {
        booth: "책방나비",
        theme: "일러스트",
      }),
    );
  });

  it("interested, 매칭 있어도 categoryLabel 없으면 기존 문장", () => {
    const result = buildReactionLine(
      "interested",
      ["discovery"],
      "책방나비",
      undefined,
      [node("discovery", 0.9, "발견")],
      t,
    );
    expect(result).toBe(t("companion.reactInterested", { booth: "책방나비" }));
  });

  it("skip, 확신 매칭(>=0.25) → 헤지된 문장", () => {
    const result = buildReactionLine(
      "skip",
      ["discovery"],
      "책방나비",
      "일러스트",
      [node("discovery", 0.5, "발견")],
      t,
    );
    expect(result).toBe(
      t("companion.reactSkipConfident", { booth: "책방나비", theme: "일러스트" }),
    );
  });

  it("skip, 매칭 있어도 confidence<0.25 → 기존 문장(단정 안 함)", () => {
    const result = buildReactionLine(
      "skip",
      ["discovery"],
      "책방나비",
      "일러스트",
      [node("discovery", 0.1, "발견")],
      t,
    );
    expect(result).toBe(t("companion.reactSkip", { booth: "책방나비" }));
  });

  it("skip, 매칭 없음 → 기존 문장", () => {
    const result = buildReactionLine(
      "skip",
      ["discovery"],
      "책방나비",
      "일러스트",
      [],
      t,
    );
    expect(result).toBe(t("companion.reactSkip", { booth: "책방나비" }));
  });

  it("later는 확신 매칭이 있어도 분야 언급 없이 기존 문장(판정 가중치가 약함)", () => {
    const result = buildReactionLine(
      "later",
      ["discovery"],
      "책방나비",
      "일러스트",
      [node("discovery", 0.9, "발견")],
      t,
    );
    expect(result).toBe(t("companion.reactLater", { booth: "책방나비" }));
  });

  it("seen은 항상 기존 문장", () => {
    const result = buildReactionLine(
      "seen",
      ["discovery"],
      "책방나비",
      "일러스트",
      [node("discovery", 0.9, "발견")],
      t,
    );
    expect(result).toBe(t("companion.reactSeen", { booth: "책방나비" }));
  });

  it("여러 가치 slug가 매칭되면 confidence 최고(정렬상 첫 매치)를 말한다", () => {
    const result = buildReactionLine(
      "interested",
      ["discovery", "goods"],
      "책방나비",
      "일러스트",
      [node("discovery", 0.6, "발견"), node("goods", 0.3, "굿즈")],
      t,
    );
    expect(result).toBe(
      t("companion.reactInterestedConfident", {
        booth: "책방나비",
        theme: "일러스트",
      }),
    );
  });

  it("부스 이름이 없으면 Plain 판본으로 자연 degrade", () => {
    const result = buildReactionLine(
      "interested",
      ["discovery"],
      undefined,
      "일러스트",
      [node("discovery", 0.4, "발견")],
      t,
    );
    expect(result).toBe(
      t("companion.reactInterestedConfidentPlain", { theme: "일러스트" }),
    );
  });
});
