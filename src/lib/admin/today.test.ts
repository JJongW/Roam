import { describe, expect, it } from "vitest";
import {
  buildTodayItems,
  countByFair,
  QUEUE_KEYS,
  sumFairs,
  unavailableFrom,
  upcomingFairs,
  type FairFacts,
  type QueueCount,
  type QueueKey,
} from "@/lib/admin/today";

const fairs = [
  { id: "a", slug: "fair-a", name: "가 박람회" },
  { id: "b", slug: "fair-b", name: "나 박람회" },
];

const zero = (): Record<QueueKey, QueueCount> =>
  Object.fromEntries(QUEUE_KEYS.map((k) => [k, { state: "ok", count: 0 }])) as Record<QueueKey, QueueCount>;

describe("countByFair, sumFairs", () => {
  it("박람회별로 세고 많은 순으로 둔다", () => {
    const rows = [{ exhibitionId: "a" }, { exhibitionId: "b" }, { exhibitionId: "b" }];
    expect(countByFair(rows, fairs).map((f) => [f.slug, f.count])).toEqual([
      ["fair-b", 2],
      ["fair-a", 1],
    ]);
  });

  it("모르는 박람회 id도 버리지 않는다", () => {
    expect(countByFair([{ exhibitionId: "gone" }], fairs)).toEqual([
      { exhibitionId: "gone", slug: "gone", name: "알 수 없는 박람회", count: 1 },
    ]);
  });

  it("합치면서 0인 박람회는 줄에서 뺀다", () => {
    const c = sumFairs([
      { exhibitionId: "a", slug: "fair-a", name: "가", count: 0 },
      { exhibitionId: "b", slug: "fair-b", name: "나", count: 3 },
    ]);
    expect(c).toEqual({ state: "ok", count: 3, atLeast: undefined, byFair: [{ exhibitionId: "b", slug: "fair-b", name: "나", count: 3 }] });
  });

  it("두 번째 숫자(직접 조사)를 박람회별로 더하고, 그것만 있는 박람회도 남긴다", () => {
    const c = sumFairs(
      [
        { exhibitionId: "a", slug: "fair-a", name: "가", count: 0, secondary: 2 },
        { exhibitionId: "b", slug: "fair-b", name: "나", count: 1, secondary: 1 },
        { exhibitionId: "c", slug: "fair-c", name: "다", count: 0, secondary: 0 },
      ],
      false,
      "직접 조사",
    );
    expect(c).toMatchObject({ count: 1, secondary: { label: "직접 조사", count: 3 } });
    expect(c.state === "ok" && c.byFair?.map((f) => f.slug)).toEqual(["fair-b", "fair-a"]);
  });

  it("조회 상한에 걸렸으면 이상으로 표시한다", () => {
    expect(sumFairs([], true)).toMatchObject({ count: 0, atLeast: true });
  });
});

describe("buildTodayItems", () => {
  it("모든 큐가 한 번씩 나온다", () => {
    expect(buildTodayItems(zero()).map((i) => i.key).sort()).toEqual([...QUEUE_KEYS].sort());
  });

  it("할 일이 있는 카드가 위로, 0과 준비 전은 아래로 가고 같은 무리 안에서는 우선순위를 지킨다", () => {
    const counts = zero();
    counts.dataIssues = { state: "ok", count: 4 };
    counts.drafts = { state: "ok", count: 2 };
    counts.articles = { state: "unavailable", reason: "준비 전" };
    const keys = buildTodayItems(counts).map((i) => i.key);
    expect(keys.slice(0, 2)).toEqual(["drafts", "dataIssues"]);
    // 준비 전인 아티클은 0인 카드들 사이에서 원래 순서(맨 앞)를 지킨다.
    expect(keys[2]).toBe("articles");
  });
});

describe("unavailableFrom", () => {
  it("표가 없으면 준비 전", () => {
    expect(unavailableFrom(new Error('아티클 조회 실패: relation "public.article" does not exist'))).toEqual({
      state: "unavailable",
      reason: "준비 전",
    });
    expect(unavailableFrom(new Error("Could not find the table 'public.article' in the schema cache"))).toMatchObject({
      reason: "준비 전",
    });
  });

  it("다른 실패도 0건으로 보이지 않는다", () => {
    expect(unavailableFrom(new Error("fetch failed"))).toEqual({ state: "unavailable", reason: "읽지 못했어요" });
  });
});

const fact = (over: Partial<FairFacts> & { slug: string }): FairFacts => ({
  id: over.slug,
  name: over.slug,
  startDate: "2026-12-01",
  endDate: "2026-12-03",
  boothCount: 0,
  brandCount: 0,
  ...over,
});

describe("upcomingFairs", () => {
  const today = "2026-11-19";
  const floorplanSlugs = new Set(["ready", "nobooths"]);

  it("60일 안에 시작하는 박람회만, 시작일 순으로", () => {
    const out = upcomingFairs({
      fairs: [
        fact({ slug: "past", startDate: "2026-11-01", endDate: "2026-11-20" }),
        fact({ slug: "far", startDate: "2027-02-01" }),
        fact({ slug: "ready", startDate: "2026-12-10", boothCount: 50, brandCount: 40 }),
        fact({ slug: "nobooths", startDate: "2026-11-19", brandCount: 12 }),
      ],
      files: [],
      floorplanSlugs,
      today,
    });
    expect(out.map((f) => [f.slug, f.daysUntil, f.note])).toEqual([
      ["nobooths", 0, "부스 인입 대기"],
      ["ready", 21, "준비됨"],
    ]);
  });

  it("레포 파일에만 있는 박람회도 넣고, 배치도가 없으면 배치도 대기", () => {
    const out = upcomingFairs({
      fairs: [],
      files: [
        { kind: "exhibition", path: "data/exhibitions/sdf-2026.json", slug: "sdf-2026", name: "서울디자인페스티벌", startDate: "2026-11-26", endDate: "2026-11-29" },
        { kind: "brands", path: "data/brands/sdf-2026.json", slug: "sdf-2026", size: 140 },
      ],
      floorplanSlugs,
      today,
    });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      id: null,
      registered: false,
      floorplan: false,
      brands: { count: 140, fromFile: true },
      booths: 0,
      daysUntil: 7,
      next: "floorplan",
      note: "배치도 대기",
    });
  });

  it("배치도는 있고 행사가 없으면 행사 등록 대기, 브랜드가 0이면 브랜드 인입 대기", () => {
    const out = upcomingFairs({
      fairs: [fact({ slug: "nobooths", startDate: "2026-12-01", brandCount: 0 })],
      files: [{ kind: "exhibition", path: "x", slug: "ready", startDate: "2026-12-02" }],
      floorplanSlugs,
      today,
    });
    expect(out.map((f) => f.note)).toEqual(["브랜드 인입 대기", "행사 등록 대기"]);
  });

  it("브랜드 수를 모르면 브랜드 단계로 막지 않는다", () => {
    const [f] = upcomingFairs({
      fairs: [fact({ slug: "nobooths", startDate: "2026-12-01", brandCount: null })],
      files: [],
      floorplanSlugs,
      today,
    });
    expect(f.brands).toBeNull();
    expect(f.note).toBe("부스 인입 대기");
  });

  it("다른 단계가 다 끝나도 브랜드 수를 모르면 준비됨이라 하지 않는다", () => {
    const [f] = upcomingFairs({
      fairs: [fact({ slug: "ready", startDate: "2026-12-01", boothCount: 5, brandCount: null })],
      files: [],
      floorplanSlugs,
      today,
    });
    expect(f.note).toBe("브랜드 확인 필요");
  });
});
