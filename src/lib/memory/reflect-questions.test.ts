import { describe, expect, it } from "vitest";
import {
  applyReflectAnswer,
  closingLine,
  nextReflectQuestion,
} from "./reflect-questions";
import { emptyBrain } from "./distill";
import type { UserBrain } from "@/lib/types";

const brain = (prefs: UserBrain["preferences"] = {}): UserBrain => ({
  ...emptyBrain("u", "2026-01-01T00:00:00.000Z"),
  preferences: prefs,
});

describe("nextReflectQuestion", () => {
  it("아무것도 모를 땐 영향이 가장 큰 것부터 묻는다", () => {
    expect(nextReflectQuestion(brain())?.key).toBe("depthVsBreadth");
  });

  it("이미 답한 건 다시 묻지 않는다", () => {
    expect(nextReflectQuestion(brain({ depthVsBreadth: 0 }))?.key).toBe(
      "crowdTolerance",
    );
  });

  // 같은 걸 또 묻는 게 신뢰를 가장 빨리 깎는다.
  it("다 채워졌으면 더 묻지 않는다", () => {
    const full = brain({
      depthVsBreadth: 0,
      crowdTolerance: 0.5,
      companion: "alone",
      movement: "balanced",
      waitTolerance: 0.5,
    });
    expect(nextReflectQuestion(full)).toBeNull();
  });

  it("브레인이 없어도 질문을 준다(첫 관람)", () => {
    expect(nextReflectQuestion(null)?.key).toBe("depthVsBreadth");
  });

  it("질문마다 고를 답이 있다", () => {
    let b = brain();
    for (let i = 0; i < 5; i++) {
      const q = nextReflectQuestion(b);
      expect(q, `${i}번째 질문`).not.toBeNull();
      expect(q!.options.length).toBeGreaterThan(1);
      expect(q!.prompt.length).toBeGreaterThan(0);
      b = applyReflectAnswer(b, q!.key, q!.options[0].value);
    }
    expect(nextReflectQuestion(b)).toBeNull();
  });
});

describe("applyReflectAnswer", () => {
  it("답을 preferences에 반영한다", () => {
    const next = applyReflectAnswer(brain(), "depthVsBreadth", 0);
    expect(next.preferences.depthVsBreadth).toBe(0);
  });

  it("입력을 바꾸지 않는다", () => {
    const b = brain();
    applyReflectAnswer(b, "depthVsBreadth", 0);
    expect(b.preferences.depthVsBreadth).toBeUndefined();
  });

  // 클라가 보낸 값을 그대로 믿지 않는다.
  it("모르는 키는 무시한다", () => {
    const next = applyReflectAnswer(brain(), "favouriteColour", "red");
    expect(next.preferences).toEqual({});
  });

  it("선택지에 없는 값은 무시한다", () => {
    const next = applyReflectAnswer(brain(), "companion", "dragon");
    expect(next.preferences.companion).toBeUndefined();
  });
});

describe("closingLine", () => {
  it("오늘 반응과 답변을 함께 되짚는다", () => {
    const q = nextReflectQuestion(brain())!;
    const line = closingLine(["동물", "일상·감성"], q, "몇 곳만 깊게");
    expect(line).toContain("동물·일상·감성");
    expect(line).toContain("몇 곳만 깊게");
    expect(line).toContain("다음 전시");
  });

  it("테마만 있어도 말이 된다", () => {
    expect(closingLine(["동물"], null)).toContain("동물");
  });

  // 지어내지 않는다.
  it("재료가 없으면 아무 말도 하지 않는다", () => {
    expect(closingLine([], null)).toBeNull();
  });
});
