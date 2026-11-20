import { beforeEach, describe, expect, it } from "vitest";
import { cleanRecap, readRecap, RECAP_MAX, saveRecap } from "./visit-memory";

// Node 25는 자체 localStorage가 jsdom 것을 가린다. 메모리 저장소를 꽂아 어느 Node에서든 같게 돈다.
function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, String(v)),
  };
}

describe("visit-memory", () => {
  beforeEach(() => {
    Object.defineProperty(window, "localStorage", { value: memoryStorage(), configurable: true });
  });
  it("iOS와 같은 키에 남긴다", () => {
    expect(saveRecap("fair", "  좋았어요  ", new Date("2026-12-04T09:00:00Z"))).toBe(true);
    expect(window.localStorage.getItem("roam.visitMemory.fair")).toBe("좋았어요");
    expect(window.localStorage.getItem("roam.visitMemory.fair.date")).toBe("2026-12-04T09:00:00.000Z");
    expect(readRecap("fair").text).toBe("좋았어요");
  });
  it("빈 칸은 남기지 않는다", () => {
    expect(saveRecap("fair", "   ")).toBe(false);
    expect(readRecap("fair")).toEqual({ text: "", date: null });
  });
  it("300자로 자른다", () => {
    expect(cleanRecap("가".repeat(400))).toHaveLength(RECAP_MAX);
  });
});
