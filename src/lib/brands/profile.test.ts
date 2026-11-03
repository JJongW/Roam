import { describe, expect, it } from "vitest";
import {
  BRAND_FIELDS,
  publicValue,
  staleOnNewAppearance,
  workerMayWrite,
  adminStatusError,
  fillLevel,
  parseFieldValue,
  planFieldMerge,
  profileFieldId,
  summarizeFill,
} from "./profile";

const ex = { exhibitorId: "x1" };
const pt = { participantId: "p1" };

describe("parseFieldValue", () => {
  it("칸마다 값 모양을 검사한다", () => {
    expect(parseFieldValue(ex, "items", ["스티커", "엽서"])).toEqual({ ok: true, value: ["스티커", "엽서"] });
    expect(parseFieldValue(ex, "items", ["아무거나"]).ok).toBe(false); // 정해진 목록 밖
    expect(parseFieldValue(ex, "texture", { tags: [] }).ok).toBe(false); // 태그나 한 줄 중 하나
    expect(parseFieldValue(ex, "texture", { tags: ["몽환 SF"], note: "푸른 밤" }).ok).toBe(true);
    expect(parseFieldValue(ex, "priceRange", { min: 5000, max: 3000, currency: "KRW" }).ok).toBe(false);
    expect(parseFieldValue(ex, "links", [{ kind: "instagram", url: "https://instagram.com/a" }]).ok).toBe(true);
    expect(parseFieldValue(ex, "whyMake", { summary: "  " }).ok).toBe(false);
    expect(parseFieldValue(ex, "nope", "x")).toEqual({ ok: false, message: "없는 칸이에요" });
    // 출전 칸과 브랜드 칸은 따로다.
    expect(parseFieldValue(pt, "boothcutUrl", "https://comicw.net/g/1").ok).toBe(true);
    expect(parseFieldValue(pt, "artistName", "x").ok).toBe(false);
  });

  it("id는 주인과 칸에서 나온다", () => {
    expect(profileFieldId(ex, "items")).toBe("ex:x1:items");
    expect(profileFieldId(pt, "days")).toBe("pt:p1:days");
  });
});

describe("adminStatusError", () => {
  it("공식 자료 표시는 부스 정보에서 가져온 값만", () => {
    expect(adminStatusError(ex, "links", "collected", ["roam:booth/b1"])).toBeNull();
    expect(adminStatusError(ex, "links", "collected", ["https://x.com/a"])).not.toBeNull();
    expect(adminStatusError(ex, "links", "collected", [])).not.toBeNull();
  });
  it("왜 만드나는 출처(작가 답) 없이 저장하지 않는다", () => {
    expect(adminStatusError(ex, "whyMake", "reviewed", [])).not.toBeNull();
    expect(adminStatusError(ex, "whyMake", "artist_confirmed", ["contact-log:bcl_1"])).toBeNull();
    expect(adminStatusError(ex, "identityLine", "reviewed", [])).toBeNull();
  });
});

describe("summarizeFill", () => {
  it("확인된 칸, AI 초안, 다시 볼 칸, 빈 칸을 센다", () => {
    const s = summarizeFill([
      { field: "items", status: "reviewed" },
      { field: "links", status: "collected" },
      { field: "whyMake", status: "artist_confirmed" },
      { field: "texture", status: "ai_draft" },
      { field: "priceRange", status: "stale" },
    ]);
    expect(s).toEqual({ total: 11, confirmed: 3, aiDraft: 1, stale: 1, empty: 6 });
    expect(fillLevel(s)).toBe("partial");
    expect(fillLevel(summarizeFill([{ field: "texture", status: "ai_draft" }]))).toBe("empty");
  });
});

describe("publicValue (2026-11-03 개정 규칙)", () => {
  const def = (key: string) => BRAND_FIELDS.find((f) => f.key === key)!;
  it("사실 칸은 collected부터 보이고, AI 초안과 다시 볼 칸은 안 보인다", () => {
    expect(publicValue(def("items"), { status: "collected", value: ["스티커"] })).toEqual(["스티커"]);
    expect(publicValue(def("items"), { status: "ai_draft", value: ["스티커"] })).toBeUndefined();
    expect(publicValue(def("items"), { status: "stale", value: ["스티커"] })).toBeUndefined();
  });
  it("설명 문장은 게이트를 넘은 말투 변환본만, 원문은 안 보인다", () => {
    const intro = def("intro");
    expect(publicValue(intro, { status: "collected", value: { original: "원문입니다." } })).toBeUndefined();
    expect(publicValue(intro, { status: "collected", value: { original: "원문입니다.", display: "원문이에요.", gate: { ok: false, issues: ["x"] } } })).toBeUndefined();
    expect(publicValue(intro, { status: "collected", value: { original: "원문입니다.", display: "원문이에요.", gate: { ok: true, issues: [] } } })).toBe("원문이에요.");
    expect(publicValue(intro, { status: "reviewed", value: { original: "원문입니다.", display: "사람이 고친 문장이에요." } })).toBe("사람이 고친 문장이에요.");
  });
  it("왜 만드나는 작가 확인만", () => {
    expect(publicValue(def("whyMake"), { status: "reviewed", value: { summary: "계기" } })).toBeUndefined();
    expect(publicValue(def("whyMake"), { status: "artist_confirmed", value: { summary: "계기" } })).toEqual({ summary: "계기" });
  });
});

describe("워커 규칙", () => {
  it("빈 칸, 다시 볼 칸, AI 초안만 쓴다", () => {
    expect(workerMayWrite(undefined)).toBe(true);
    expect(workerMayWrite({ status: "stale" })).toBe(true);
    expect(workerMayWrite({ status: "ai_draft" })).toBe(true);
    expect(workerMayWrite({ status: "collected" })).toBe(false);
    expect(workerMayWrite({ status: "reviewed" })).toBe(false);
    expect(workerMayWrite({ status: "artist_confirmed" })).toBe(false);
  });
  it("새 출전이 이어지면 품목, 가격대, 대표 작품만 stale로", () => {
    expect(
      staleOnNewAppearance([
        { field: "items", status: "reviewed" },
        { field: "priceRange", status: "collected" },
        { field: "signatureWorks", status: "stale" },
        { field: "artistName", status: "reviewed" },
      ]),
    ).toEqual(["items", "priceRange"]);
  });
});

describe("planFieldMerge", () => {
  it("대상에 없는 칸만 옮기고 겹치면 대상 것을 지킨다", () => {
    expect(planFieldMerge([{ field: "items" }, { field: "links" }], [{ field: "links" }])).toEqual({
      move: ["items"],
      drop: ["links"],
    });
  });
});
