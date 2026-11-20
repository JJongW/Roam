import { describe, expect, it } from "vitest";
import { inboxHref, inboxIcon, inboxTimeLabel, isThisWeek, type InboxRow } from "./view";

const row = (landing: InboxRow["landing"]): InboxRow => ({
  id: "n1",
  title: "t",
  body: "b",
  createdAt: "2026-11-20T01:00:00Z",
  readAt: null,
  landing,
});
// 2026-11-20 12:00 KST
const now = new Date("2026-11-20T03:00:00Z");

describe("inboxHref", () => {
  it("브랜드 알림은 부스가 있으면 부스 상세, 없으면 그 박람회 지도", () => {
    expect(inboxHref(row({ kind: "brand", slug: "f", boothId: "b1" }))).toBe("/booths/b1");
    expect(inboxHref(row({ kind: "brand", slug: "f" }))).toBe("/exhibitions/f/map");
  });
  it("박람회 알림은 지도, 모르는 종류는 갈 곳 없음", () => {
    expect(inboxHref(row({ kind: "fair", slug: "f" }))).toBe("/exhibitions/f/map");
    expect(inboxHref(row({ kind: "other", slug: "f" }))).toBeNull();
    expect(inboxIcon(row({ kind: "brand", slug: "f" }))).toBe("brand");
  });
});

describe("inboxTimeLabel", () => {
  it("서울 날짜로 오늘, 어제, 그 전은 날짜", () => {
    expect(inboxTimeLabel("2026-11-19T16:00:00Z", now)).toBe("오늘"); // 11-20 01시 KST
    expect(inboxTimeLabel("2026-11-19T14:00:00Z", now)).toBe("어제"); // 11-19 23시 KST
    expect(inboxTimeLabel("2026-11-02T03:00:00Z", now)).toBe("11월 2일");
    expect(inboxTimeLabel("nope", now)).toBe("");
  });
  it("7일 안은 이번 주", () => {
    expect(isThisWeek("2026-11-14T03:00:00Z", now)).toBe(true);
    expect(isThisWeek("2026-11-13T03:00:00Z", now)).toBe(false);
  });
});
