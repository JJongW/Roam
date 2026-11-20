import { describe, expect, it } from "vitest";
import { brightOnly, verdictCandidate } from "./ended-map";

const booths = [
  { id: "a", kind: "exhibitor" },
  { id: "b", kind: "exhibitor" },
  { id: "c", kind: "exhibitor" },
  { id: "wc", kind: "facility" },
];

describe("끝난 박람회 지도(UI 11)", () => {
  it("남긴 게 없으면 전부 보통(F-A)", () => {
    expect(brightOnly(booths, {})).toBeNull();
  });

  it("남긴 곳과 편의시설만 밝게(F-B)", () => {
    const bright = brightOnly(booths, { a: { heart: true }, b: { memo: "  " } });
    expect(bright && [...bright].sort()).toEqual(["a", "wc"]);
  });

  it("M4는 다녀왔고 평가 없는 곳을 먼저 다녀온 순으로", () => {
    const rec = {
      a: { visited: true, visitedAt: "2026-11-09T05:00:00Z" },
      b: { visited: true, visitedAt: "2026-11-09T03:00:00Z" },
      c: { visited: true, verdict: "good" as const },
    };
    expect(verdictCandidate(booths, rec)?.id).toBe("b");
    expect(verdictCandidate(booths, { c: rec.c })).toBeNull();
  });
});
