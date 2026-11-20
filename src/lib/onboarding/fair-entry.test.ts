import { beforeEach, describe, expect, it } from "vitest";
import {
  EMPTY_STATE,
  entryStep,
  firstPicks,
  moodBooths,
  readFairState,
  reasonCategory,
  reasonPhoto,
  updateFairState,
} from "./fair-entry";

const TODAY = "2026-11-20";
const s = (over: Partial<typeof EMPTY_STATE> = {}) => ({ ...EMPTY_STATE, ...over });
const booth = (id: string, categoryId: string, photo = true) => ({
  id,
  categoryId,
  images: photo ? [`/${id}.jpg`] : [],
  kind: "exhibitor" as const,
});

describe("entryStep (UI 1)", () => {
  it("처음이면 사진이 여섯 장일 때만 사진 고르기", () => {
    expect(entryStep(s(), { photoCount: 6, heartsHere: 0, today: TODAY })).toBe("mood");
    expect(entryStep(s(), { photoCount: 5, heartsHere: 0, today: TODAY })).toBe("none");
  });
  it("같은 날 다시 열면 아무것도 묻지 않는다", () => {
    expect(entryStep(s({ openCount: 1, lastOpenedDay: TODAY }), { photoCount: 6, heartsHere: 2, today: TODAY })).toBe("none");
  });
  it("다른 날, 하트가 있으면 1-09", () => {
    expect(entryStep(s({ openCount: 1, lastOpenedDay: "2026-11-19" }), { photoCount: 6, heartsHere: 1, today: TODAY })).toBe(
      "returnWithHearts",
    );
  });
  it("건너뛴 분께 한 번만 다시 묻는다(1-10)", () => {
    const base = { openCount: 1, lastOpenedDay: "2026-11-19", moodSkipped: true };
    expect(entryStep(s(base), { photoCount: 6, heartsHere: 0, today: TODAY })).toBe("reask");
    expect(entryStep(s({ ...base, reaskShown: true }), { photoCount: 6, heartsHere: 0, today: TODAY })).toBe("none");
  });
});

describe("moodBooths", () => {
  it("분류를 돌아가며 여섯 장, 사진 없는 부스는 뺀다", () => {
    const list = [
      booth("a1", "A"),
      booth("a2", "A"),
      booth("a3", "A"),
      booth("a4", "A"),
      booth("b1", "B"),
      booth("b2", "B"),
      booth("c1", "C", false),
      booth("c2", "C"),
    ];
    expect(moodBooths(list).map((b) => b.id)).toEqual(["a1", "b1", "c2", "a2", "b2", "a3"]);
  });
});

describe("firstPicks", () => {
  const list = [booth("a1", "A"), booth("a2", "A"), booth("b1", "B"), booth("b2", "B")];
  const name = (c: string) => ({ A: "문구", B: "향" })[c];
  it("고른 두 곳 + 같은 분류 한 곳", () => {
    expect(firstPicks(["a1", "b1"], list, name, new Set(), new Set())).toEqual([
      { boothId: "a1", reason: reasonPhoto },
      { boothId: "b1", reason: reasonPhoto },
      { boothId: "a2", reason: reasonCategory("문구") },
    ]);
  });
  it("하트 남긴 곳과 이건 아니에요는 뺀다", () => {
    const out = firstPicks(["a1", "b1"], list, name, new Set(["a1"]), new Set(["a2"]));
    expect(out.map((p) => p.boothId)).toEqual(["b1", "b2"]);
  });
});

describe("저장", () => {
  beforeEach(() => window.localStorage.clear());
  it("박람회마다 따로 남는다", () => {
    updateFairState("x", (st) => ({ ...st, openCount: st.openCount + 1, moodBoothIds: ["a"] }));
    expect(readFairState("x").openCount).toBe(1);
    expect(readFairState("x").moodBoothIds).toEqual(["a"]);
    expect(readFairState("y").openCount).toBe(0);
    expect(window.localStorage.getItem("roam.fair.x")).toContain("moodBoothIds");
  });
});
