import { describe, expect, it } from "vitest";
import { checkToneConversion } from "./tone-gate";

const original =
  "직접 그린 러프한 그림들을 일상 속 소품에 담아 취향이 자라나는 공간을 제안하는 아트 브랜드입니다. 그림에서 시작된 디자인이 쿠션, 패브릭, 포스터로 이어집니다. 2019년부터 Heedagarden이라는 이름으로 활동했습니다.";

describe("checkToneConversion", () => {
  it("말투만 바꾸고 숫자, 이름, 품목을 지키면 통과", () => {
    const display =
      "직접 그린 러프한 그림을 일상 속 소품에 담아, 취향이 자라는 공간을 제안하는 아트 브랜드예요. 그림에서 시작한 디자인이 쿠션, 패브릭, 포스터로 이어져요. 2019년부터 Heedagarden이라는 이름으로 활동했어요.";
    expect(checkToneConversion({ original, display, protectedTerms: ["포스터", "쿠션", "희다가든"] })).toEqual({ ok: true, issues: [] });
  });

  it("숫자가 빠지거나 생기면 실패", () => {
    const r = checkToneConversion({
      original,
      display: "직접 그린 그림을 소품에 담는 아트 브랜드예요. 디자인이 쿠션, 패브릭, 포스터로 이어져요. 2020년부터 Heedagarden이라는 이름으로 활동했어요.",
    });
    expect(r.ok).toBe(false);
    expect(r.issues).toContain("숫자가 빠졌어요: 2019");
    expect(r.issues).toContain("원문에 없는 숫자가 생겼어요: 2020");
  });

  it("영문 이름과 지켜야 할 품목이 빠지면 실패", () => {
    const r = checkToneConversion({
      original,
      display: "직접 그린 러프한 그림을 일상 속 소품에 담아 취향이 자라는 공간을 제안하는 아트 브랜드예요. 그림에서 시작한 디자인이 쿠션과 패브릭으로 이어져요. 2019년부터 활동했어요.",
      protectedTerms: ["포스터"],
    });
    expect(r.issues).toContain("이름이나 표기가 빠졌어요: Heedagarden");
    expect(r.issues).toContain("지켜야 할 말이 빠졌어요: 포스터");
  });

  it("합니다체, 전시, 가운뎃점, 과장이 남으면 실패", () => {
    const r = checkToneConversion({
      original: "수공예 키링을 만드는 공방입니다. 매년 일러스트 페어에 참가합니다.",
      display: "최고의 수공예 키링을 만드는 공방입니다. 매년 일러스트 전시·페어에 참가해요!",
    });
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.startsWith("해요체가 아닌 문장"))).toBe(true);
    expect(r.issues.some((i) => i.startsWith('"전시"'))).toBe(true);
    expect(r.issues.some((i) => i.startsWith("가운뎃점"))).toBe(true);
    expect(r.issues).toContain("원문에 없는 과장이나 단정이 생겼어요: 최고");
  });

  it("원문 고유명사 안의 전시는 그대로 둘 수 있다", () => {
    const r = checkToneConversion({
      original: "'서울전시공방'은 판화를 만듭니다.",
      display: "'서울전시공방'은 판화를 만들어요.",
    });
    expect(r).toEqual({ ok: true, issues: [] });
  });

  it("받침 없는 말 뒤 이에요는 예요로", () => {
    const r = checkToneConversion({ original: "아트 브랜드입니다.", display: "아트 브랜드이에요." });
    expect(r.issues).toContain('"드이에요"는 "드예요"로 써 주세요');
    expect(checkToneConversion({ original: "공방입니다.", display: "공방이에요." }).ok).toBe(true);
  });

  it("너무 짧아지면 내용이 빠진 것으로 본다", () => {
    const r = checkToneConversion({ original, display: "아트 브랜드예요. 2019 Heedagarden" });
    expect(r.issues.some((i) => i.startsWith("원문보다 너무 짧아요"))).toBe(true);
  });
});
