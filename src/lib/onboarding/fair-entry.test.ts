import { beforeEach, describe, expect, it } from "vitest";
import {
  EMPTY_STATE,
  entryStep,
  firstPicks,
  moodBooths,
  moodPool,
  refreshMood,
  canRefreshMood,
  morePicks,
  readFairState,
  readPicksOnMap,
  saveFirstPicksResume,
  takeFirstPicksResume,
  writePicksOnMap,
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

describe("다른 사진 보기(2026-11-28 Ted)", () => {
  const ids = (xs: { id: string }[]) => xs.map((b) => b.id);
  const pool = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l"].map((id) => ({ id }));
  const first = pool.slice(0, 6);
  const seen0 = new Set(ids(first));

  it("moodPool은 여섯 장 뒤로도 같은 차례를 잇는다", () => {
    const list = ["a1", "a2", "a3", "a4", "b1", "b2", "c2"].map((id) => booth(id, id[0].toUpperCase()));
    expect(ids(moodPool(list))).toEqual(["a1", "b1", "c2", "a2", "b2", "a3", "a4"]);
    expect(ids(moodBooths(list))).toEqual(ids(moodPool(list)).slice(0, 6));
  });

  it("고른 칸은 그 자리에 그대로, 고르지 않은 칸만 안 보여 준 사진으로 바뀐다", () => {
    const next = refreshMood(first, ["b", "e"], pool, seen0);
    expect(ids(next)).toEqual(["g", "b", "h", "i", "e", "j"]);
  });

  it("이미 보여 준 사진은 다시 꺼내지 않고, 모자라면 앞 칸부터 바꾸고 나머지는 그대로 둔다", () => {
    const seen = new Set([...seen0, "g", "h", "i", "j"]);
    const shown = ["g", "b", "h", "i", "e", "j"].map((id) => ({ id }));
    const next = refreshMood(shown, ["b", "e"], pool, seen);
    expect(ids(next)).toEqual(["k", "b", "l", "i", "e", "j"]);
    expect(next.filter((b) => ["a", "c", "d", "f"].includes(b.id))).toEqual([]);
  });

  it("더 보여 줄 사진이 없거나 모든 칸을 골랐으면 꺼진다", () => {
    expect(canRefreshMood(first, [], pool, seen0)).toBe(true);
    expect(canRefreshMood(first, [], first, seen0)).toBe(false);
    expect(canRefreshMood(first, ids(first), pool, seen0)).toBe(false);
    expect(refreshMood(first, [], first, seen0)).toEqual(first);
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

describe("morePicks (8-04 K-C)", () => {
  const list = [
    booth("a1", "A"),
    booth("a2", "A"),
    booth("a3", "A"),
    booth("b1", "B"),
    booth("b2", "B"),
    booth("c1", "C"),
  ];
  const name = (c: string) => ({ A: "문구", B: "향" })[c];
  it("고른 사진의 부스, 그다음 같은 분류를 돌아가며. 다른 분류는 넣지 않는다", () => {
    expect(morePicks(["a1", "b1"], list, name, new Set(), new Set())).toEqual([
      { boothId: "a1", reason: reasonPhoto },
      { boothId: "b1", reason: reasonPhoto },
      { boothId: "a2", reason: reasonCategory("문구") },
      { boothId: "b2", reason: reasonCategory("향") },
      { boothId: "a3", reason: reasonCategory("문구") },
    ]);
  });
  it("사진을 고르지 않았으면 고르지 않는다(이유를 지어내지 않는다)", () => {
    expect(morePicks([], list, name, new Set(), new Set())).toEqual([]);
  });
  it("하트 남긴 곳과 이건 아니에요는 빼고, 수를 넘지 않는다", () => {
    const out = morePicks(["a1", "b1"], list, name, new Set(["a1"]), new Set(["a2"]), 2);
    expect(out.map((p) => p.boothId)).toEqual(["b1", "a3"]);
  });
});

describe("지도에 켜기(8-07)", () => {
  beforeEach(() => window.localStorage.clear());
  it("오늘만 켜져 있다", () => {
    writePicksOnMap("x", true, TODAY);
    expect(readPicksOnMap("x", TODAY)).toBe(true);
    expect(readPicksOnMap("x", "2026-11-21")).toBe(false);
    expect(window.localStorage.getItem("roam.picksOnMap.x")).toBe(TODAY);
    writePicksOnMap("x", false, TODAY);
    expect(readPicksOnMap("x", TODAY)).toBe(false);
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

describe("UI 24 Q2A-2 상세에서 뒤로 오면 같은 미리보기 시트", () => {
  beforeEach(() => window.sessionStorage.clear());
  const r = {
    picks: [
      { boothId: "a", reason: reasonPhoto },
      { boothId: "b", reason: reasonPhoto },
    ],
    index: 1,
    head: "‘가’에 하트를 남겼어요",
  };

  it("남긴 진행을 한 번 읽고 지운다", () => {
    saveFirstPicksResume("fair", r);
    expect(takeFirstPicksResume("fair")).toEqual(r);
    expect(takeFirstPicksResume("fair")).toBeNull();
  });

  it("다른 박람회의 진행은 읽지 않는다", () => {
    saveFirstPicksResume("fair", r);
    expect(takeFirstPicksResume("other")).toBeNull();
  });

  it("모양이 틀리면(위치가 목록 밖) 없는 것으로 본다", () => {
    saveFirstPicksResume("fair", { ...r, index: 5 });
    expect(takeFirstPicksResume("fair")).toBeNull();
  });
});
