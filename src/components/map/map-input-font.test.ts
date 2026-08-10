import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// iOS Safari는 폰트가 16px 미만인 입력창에 포커스가 가면 페이지를 자동 확대한다.
// 지도는 touch-action:none + gesturestart preventDefault로 핀치를 삼키므로,
// 한번 확대되면 두 손가락으로 오므려도 빠져나올 수 없다. 그래서 지도 화면의
// 입력에는 16px 미만 클래스를 절대 붙이면 안 된다.
//
// 렌더 테스트가 아니라 소스 검사인 이유: 이 실수는 데스크톱 브라우저에서 전혀
// 드러나지 않아 리뷰와 수동 QA를 그냥 통과한다. 클래스 문자열을 직접 막는 게
// 유일하게 확실한 방어다.
const SMALL_TEXT = /\btext-(xs|sm)\b/;

describe("지도 화면 입력 폰트", () => {
  it("map-view.tsx의 Input에 16px 미만 클래스가 없다", () => {
    const src = readFileSync("src/components/map/map-view.tsx", "utf8");
    // <Input ... /> 블록만 추출해 검사한다.
    const inputs = src.match(/<Input[\s\S]*?\/>/g) ?? [];
    expect(inputs.length).toBeGreaterThan(0);
    for (const block of inputs) {
      expect(SMALL_TEXT.test(block)).toBe(false);
    }
  });
});
