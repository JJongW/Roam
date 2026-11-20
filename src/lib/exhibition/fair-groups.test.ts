import { describe, expect, it } from "vitest";
import {
  fairSubtitle,
  groupFairs,
  homeHeadline,
  homeOthers,
  monthDay,
  shortVenue,
  type FairEntry,
} from "./fair-groups";
import type { Exhibition } from "@/lib/types";

function fair(id: string, startDate: string, endDate: string, venue = "코엑스 C홀"): Exhibition {
  return {
    id,
    slug: id,
    name: id,
    venue,
    description: "",
    startDate,
    endDate,
    mapWidth: 100,
    mapHeight: 100,
    tips: { arrival: [], routes: [], facilities: [] },
    createdAt: "2026-01-01T00:00:00Z",
  } as Exhibition;
}
const e = (f: Exhibition, openable = true): FairEntry => ({ fair: f, openable });
const TODAY = "2026-11-20";

describe("groupFairs (UI 20)", () => {
  it("열린 날이어도 지도가 없으면 곧 열려요에 둔다", () => {
    const g = groupFairs([e(fair("a", "2026-11-19", "2026-11-23"), false)], TODAY);
    expect(g.open).toHaveLength(0);
    expect(g.upcoming.map((x) => x.fair.id)).toEqual(["a"]);
  });

  it("지도 없이 끝난 박람회는 숨긴다", () => {
    const g = groupFairs([e(fair("a", "2026-11-01", "2026-11-09"), false)], TODAY);
    expect(g.ended).toHaveLength(0);
  });

  it("곧 열려요는 시작일 순, 끝났어요는 최근에 끝난 순", () => {
    const g = groupFairs(
      [
        e(fair("late", "2026-12-11", "2026-12-14")),
        e(fair("soon", "2026-12-04", "2026-12-07")),
        e(fair("old", "2026-10-01", "2026-10-26")),
        e(fair("recent", "2026-11-05", "2026-11-09")),
      ],
      TODAY,
    );
    expect(g.upcoming.map((x) => x.fair.id)).toEqual(["soon", "late"]);
    expect(g.ended.map((x) => x.fair.id)).toEqual(["recent", "old"]);
  });
});

describe("homeOthers", () => {
  it("열린 곳을 먼저 채우고 남는 자리를 최근에 끝난 곳으로 채운다", () => {
    const g = groupFairs(
      [
        e(fair("o1", "2026-11-19", "2026-11-23")),
        e(fair("x1", "2026-11-01", "2026-11-09")),
        e(fair("x2", "2026-10-01", "2026-10-09")),
        e(fair("x3", "2026-09-01", "2026-09-09")),
      ],
      TODAY,
    );
    const o = homeOthers(g);
    expect(o.open.map((x) => x.fair.id)).toEqual(["o1"]);
    expect(o.ended.map((x) => x.fair.id)).toEqual(["x1", "x2"]);
  });
});

describe("줄 글", () => {
  it("날짜", () => {
    expect(monthDay("2026-12-04")).toBe("12월 4일");
  });
  it("행사장의 괄호와 가운뎃점 부연을 줄인다", () => {
    expect(shortVenue("킨텍스 (제2전시장)")).toBe("킨텍스");
    expect(shortVenue("코엑스 · 3층")).toBe("코엑스");
  });
  it("열림, 곧 열림, 끝남", () => {
    expect(fairSubtitle(e(fair("a", "2026-11-19", "2026-11-23")), TODAY)).toBe("코엑스 C홀, 11월 23일까지");
    expect(fairSubtitle(e(fair("a", "2026-12-04", "2026-12-07")), TODAY)).toBe("코엑스 C홀, 12월 4일부터 7일까지");
    expect(fairSubtitle(e(fair("a", "2026-12-30", "2027-01-02")), TODAY)).toBe("코엑스 C홀, 12월 30일부터 1월 2일까지");
    expect(fairSubtitle(e(fair("a", "2026-11-05", "2026-11-09")), TODAY)).toBe("코엑스 C홀, 11월 9일에 끝났어요");
  });
  it("날짜는 열렸는데 지도가 없으면 예정 글", () => {
    expect(fairSubtitle(e(fair("a", "2026-11-19", "2026-11-23"), false), TODAY)).toBe(
      "코엑스 C홀, 11월 19일부터 23일까지",
    );
  });
});

describe("homeHeadline", () => {
  it("열린 곳 수", () => {
    expect(homeHeadline(groupFairs([e(fair("a", "2026-11-19", "2026-11-23"))], TODAY))).toBe(
      "오늘은 한 곳이 열려 있어요",
    );
  });
  it("열린 곳이 없으면 다음에 열리는 날", () => {
    expect(homeHeadline(groupFairs([e(fair("a", "2026-12-04", "2026-12-07"))], TODAY))).toBe(
      "다음 박람회는 12월 4일에 열려요",
    );
  });
});
