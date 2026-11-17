import { describe, expect, it } from "vitest";
import { sanitizeProps } from "./app-events";

describe("sanitizeProps", () => {
  it("좌표, 메모, 회고, 묻는 말 키를 버린다", () => {
    const { props, dropped } = sanitizeProps({
      latitude: 1, lng: 2, location: "x", memo_text: "a", recap: "b", query: "c", nickname: "d",
      booth_id: "b1", source: "map", rank: 2, ok: true,
    });
    expect(props).toEqual({ booth_id: "b1", source: "map", rank: 2, ok: true });
    expect(dropped).toHaveLength(7);
  });

  it("80자를 넘는 문자열은 글 원문으로 보고 버린다", () => {
    expect(sanitizeProps({ reason: "a".repeat(81), kind: "short" }).props).toEqual({ kind: "short" });
  });

  it("비슷하지만 다른 키(step, len_bucket)는 남긴다", () => {
    expect(sanitizeProps({ step: 2, len_bucket: "1-10" }).props).toEqual({ step: 2, len_bucket: "1-10" });
  });
});
