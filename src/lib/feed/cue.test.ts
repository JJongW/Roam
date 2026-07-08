import { describe, expect, it } from "vitest";
import type { Booth, BoothEvent } from "@/lib/types";
import { deriveCue } from "./cue";

const booth = (p: Partial<Booth> = {}): Booth => ({ tags: [], ...p }) as Booth;
const ev = (p: Partial<BoothEvent>): BoothEvent =>
  ({
    id: "e",
    boothId: "b",
    title: "행사",
    description: "",
    startTime: "2026-06-24T15:00:00Z",
    endTime: "2026-06-24T16:00:00Z",
    ...p,
  }) as BoothEvent;

describe("deriveCue", () => {
  it("주목 이벤트 → 시각+제목+판단기준(명령 아님)", () => {
    const c = deriveCue(booth(), [
      ev({ title: "저자 사인회", startTime: "2026-06-24T15:00:00Z" }),
    ]);
    expect(c).toContain("저자 사인회");
    expect(c).toContain("붐빌 수 있어");
    expect(c).not.toContain("가지 마");
  });

  it("가장 이른 이벤트 우선", () => {
    const c = deriveCue(booth(), [
      ev({ title: "오후", startTime: "2026-06-24T17:00:00Z" }),
      ev({ title: "오전", startTime: "2026-06-24T11:00:00Z" }),
    ]);
    expect(c).toContain("오전");
  });

  it("상시 이벤트만이면 이벤트 큐 없음 → timing 폴백", () => {
    const c = deriveCue(
      booth({
        enrichment: {
          goodsKeywords: [],
          themeTags: [],
          timing: ["굿즈 매일 40개 한정"],
        },
      }),
      [ev({ standing: true })],
    );
    expect(c).toBe("굿즈 매일 40개 한정");
  });

  it("혼잡 팁 → 붐빔 판단 큐", () => {
    const c = deriveCue(
      booth({
        enrichment: {
          goodsKeywords: [],
          themeTags: [],
          tips: "혼잡 상·소요 20분",
        },
      }),
      [],
    );
    expect(c).toContain("붐비는 부스");
  });

  it("이벤트·팁·타이밍 없으면 undefined", () => {
    expect(deriveCue(booth(), [])).toBeUndefined();
  });
});
