import { describe, expect, it } from "vitest";
import {
  exhibitionStatus,
  seriesKeyOf,
  pickSeriesRepresentative,
} from "./status";
import type { Exhibition } from "@/lib/types";

function ex(overrides: Partial<Exhibition> & { id: string; name: string; startDate: string; endDate: string }): Exhibition {
  return {
    slug: overrides.id,
    venue: "test",
    description: "",
    mapWidth: 100,
    mapHeight: 100,
    tips: { arrival: [], routes: [], facilities: [] },
    createdAt: "2026-01-01T00:00:00Z",
    ...overrides,
  } as Exhibition;
}

describe("exhibitionStatus", () => {
  it("오늘이 시작일 이전이면 upcoming", () => {
    const e = ex({ id: "e1", name: "전시1", startDate: "2026-08-20", endDate: "2026-08-25" });
    expect(exhibitionStatus(e, "2026-08-12")).toBe("upcoming");
  });
  it("시작일 당일이면 ongoing", () => {
    const e = ex({ id: "e1", name: "전시1", startDate: "2026-08-12", endDate: "2026-08-15" });
    expect(exhibitionStatus(e, "2026-08-12")).toBe("ongoing");
  });
  it("종료일 당일이면 ongoing", () => {
    const e = ex({ id: "e1", name: "전시1", startDate: "2026-08-08", endDate: "2026-08-12" });
    expect(exhibitionStatus(e, "2026-08-12")).toBe("ongoing");
  });
  it("종료일 다음날이면 ended", () => {
    const e = ex({ id: "e1", name: "전시1", startDate: "2026-06-24", endDate: "2026-06-28" });
    expect(exhibitionStatus(e, "2026-08-12")).toBe("ended");
  });
});

describe("seriesKeyOf", () => {
  it("'제N회' 접두사를 떼어낸다", () => {
    expect(seriesKeyOf("제1회 서울국제도서전")).toBe("서울국제도서전");
    expect(seriesKeyOf("제23회 서울국제도서전")).toBe("서울국제도서전");
  });
  it("접두사 사이 공백이 있어도 처리한다", () => {
    expect(seriesKeyOf("제 5 회 일러스트레이션페어")).toBe("일러스트레이션페어");
  });
  it("접두사가 없으면 이름 그대로", () => {
    expect(seriesKeyOf("하우스 아카이브")).toBe("하우스 아카이브");
  });
});

describe("pickSeriesRepresentative", () => {
  it("같은 회차 시리즈는 upcoming·ongoing에서 가장 임박한 것만 남긴다", () => {
    const list = [
      ex({ id: "e2", name: "제2회 도서전", startDate: "2026-09-01", endDate: "2026-09-05" }),
      ex({ id: "e1", name: "제1회 도서전", startDate: "2026-08-20", endDate: "2026-08-25" }),
    ];
    const result = pickSeriesRepresentative(list, "upcoming");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("e1");
  });
  it("같은 회차 시리즈는 ended에서 가장 최근 종료한 것만 남긴다", () => {
    const list = [
      ex({ id: "e1", name: "제1회 도서전", startDate: "2026-01-01", endDate: "2026-01-05" }),
      ex({ id: "e2", name: "제2회 도서전", startDate: "2026-06-01", endDate: "2026-06-05" }),
    ];
    const result = pickSeriesRepresentative(list, "ended");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("e2");
  });
  it("다른 시리즈는 각각 남기고, 입력 순서(첫 등장 순)를 유지한다", () => {
    const list = [
      ex({ id: "a", name: "일러스트레이션페어", startDate: "2026-08-20", endDate: "2026-08-22" }),
      ex({ id: "b", name: "제1회 도서전", startDate: "2026-08-10", endDate: "2026-08-12" }),
      ex({ id: "c", name: "제2회 도서전", startDate: "2026-08-15", endDate: "2026-08-17" }),
    ];
    const result = pickSeriesRepresentative(list, "upcoming");
    expect(result.map((r) => r.id)).toEqual(["a", "b"]);
  });
  it("빈 배열이면 빈 배열", () => {
    expect(pickSeriesRepresentative([], "upcoming")).toEqual([]);
  });
});
