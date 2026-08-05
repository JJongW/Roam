import { describe, expect, it } from "vitest";
import { PUBLIC_PATH_PATTERNS } from "@/proxy";

function isPublic(pathname: string): boolean {
  return PUBLIC_PATH_PATTERNS.some((re) => re.test(pathname));
}

describe("PUBLIC_PATH_PATTERNS", () => {
  it("전시 상세를 공개로 허용", () => {
    expect(isPublic("/exhibitions/sibf-2026")).toBe(true);
  });

  it("지도를 공개로 허용", () => {
    expect(isPublic("/exhibitions/sibf-2026/map")).toBe(true);
  });

  it("부스 상세를 공개로 허용", () => {
    expect(isPublic("/booths/b_a1406")).toBe(true);
  });

  it("메모장은 여전히 막는다(더 깊은 경로)", () => {
    expect(isPublic("/exhibitions/sibf-2026/notes")).toBe(false);
  });

  it("커뮤니티는 여전히 막는다", () => {
    expect(isPublic("/exhibitions/sibf-2026/community")).toBe(false);
  });

  it("전시 목록 자체(/exhibitions)는 이 패턴에 안 걸린다", () => {
    expect(isPublic("/exhibitions")).toBe(false);
  });
});
