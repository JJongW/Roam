import { describe, expect, it } from "vitest";
import { previewMovesCamera } from "./preview-focus";

// 2026-11-28 헤더: 상세에서 뒤로 와 "로미가 고른 곳" 미리보기를 되살릴 때 지도가 움직였다.
// 11-27 Ted "상세에서 돌아오면 보던 그대로". 시트는 되살리고 카메라는 그대로 둔다.
describe("고른 곳 미리보기 시트와 카메라", () => {
  it("상세에서 뒤로 와 되살린 칸이면 시트 높이를 알아도 옮기지 않는다", () => {
    expect(previewMovesCamera("b1", 320, "b1")).toBe(false);
  });

  it("사용자가 시트를 열거나 다음 곳으로 넘기면 시트 위로 옮긴다", () => {
    expect(previewMovesCamera("b1", 320, null)).toBe(true);
    expect(previewMovesCamera("b2", 320, "b1")).toBe(true);
  });

  it("시트가 닫혀 있거나 높이를 아직 모르면 옮기지 않는다", () => {
    expect(previewMovesCamera(undefined, 320, null)).toBe(false);
    expect(previewMovesCamera("b1", null, null)).toBe(false);
  });
});
