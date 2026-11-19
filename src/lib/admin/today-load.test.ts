import { describe, expect, it } from "vitest";
import { loadAdminToday, readRepoFiles } from "@/lib/admin/today-load";
import type { TodayItem } from "@/lib/admin/today";
import type { Repository } from "@/lib/repositories/types";
import type { BoothListItem, Exhibition } from "@/lib/types";

const today = "2026-11-19";

const ex = (id: string, startDate: string, endDate: string): Exhibition =>
  ({ id, slug: `slug-${id}`, name: `박람회 ${id}`, startDate, endDate }) as Exhibition;

// 연락 현황은 끝난 지 30일 넘은 박람회는 보지 않는다 — old만 두면 연락 보드를 부르지 않는다.
const old = ex("old", "2026-08-01", "2026-08-03");
const next = ex("next", "2026-12-01", "2026-12-03");

const booth = (id: string, filled: boolean): BoothListItem =>
  ({
    id,
    name: id,
    kind: "exhibitor",
    enrichment: filled
      ? {
          summary: "s",
          valueTags: [{ slug: "x", strength: 1 }],
          recommendationReasons: { a: "b" },
          thingsToDo: ["t"],
          timing: ["t"],
          memoryHooks: ["m"],
        }
      : undefined,
  }) as unknown as BoothListItem;

function fakeRepo(over: Partial<Record<keyof Repository, unknown>> = {}): Repository {
  return {
    listArticles: async () => [],
    listExhibitorLinkCandidates: async () => [],
    listEnrichmentCandidates: async () => [],
    loadExhibitorGraph: async () => ({ exhibitors: [], participants: [], assignments: [], candidates: [] }),
    ...over,
  } as unknown as Repository;
}

const byKey = (items: TodayItem[]) => Object.fromEntries(items.map((i) => [i.key, i.count]));

async function run(repo: Repository, exhibitions = [old]) {
  return loadAdminToday(repo, {
    exhibitions,
    boothsByFair: new Map([
      ["old", [booth("o1", false)]],
      ["next", [booth("n1", false), booth("n2", true)]],
    ]),
    issues: [],
    today,
    floorplanSlugs: new Set(),
    repoFiles: [],
  });
}

describe("loadAdminToday 건수 모으기", () => {
  it("저장소가 준 대기 건수를 큐마다 센다", async () => {
    const view = await run(
      fakeRepo({
        listArticles: async (o?: { status?: string[] }) => {
          expect(o?.status).toEqual(["draft"]);
          return [{ id: "a1" }, { id: "a2" }];
        },
        listExhibitorLinkCandidates: async (status?: string) => {
          expect(status).toBe("pending");
          return [{ id: "l1" }];
        },
        listEnrichmentCandidates: async (o?: { status?: string }) => {
          expect(o?.status).toBe("pending");
          return [{ exhibitionId: "old" }, { exhibitionId: "old" }, { exhibitionId: "next" }];
        },
      }),
      [old],
    );
    const c = byKey(view.items);
    expect(c.articles).toMatchObject({ state: "ok", count: 2 });
    expect(c.brandLinks).toMatchObject({ state: "ok", count: 1 });
    expect(c.drafts).toMatchObject({ state: "ok", count: 3 });
    expect(c.drafts.state === "ok" && c.drafts.byFair?.map((f) => [f.exhibitionId, f.count])).toEqual([
      ["old", 2],
      ["next", 1],
    ]);
    expect(c.intake).toEqual({ state: "ok", count: 0, notes: [] });
    // 데이터 이슈는 끝난 박람회를 세지 않는다.
    expect(c.dataIssues).toMatchObject({ state: "ok", count: 0 });
    // 할 일이 있는 카드가 앞에 온다.
    expect(view.items.slice(0, 3).map((i) => i.key)).toEqual(["articles", "brandLinks", "drafts"]);
  });

  it("데이터 이슈는 열려 있거나 다가오는 박람회의 빈 칸만 센다", async () => {
    const repo = fakeRepo({
      // 다가오는 박람회가 있으면 연락 보드를 부른다. 여기선 실패시켜 그 칸만 못 읽게 한다.
      listBoothsByExhibitionId: async () => {
        throw new Error("boom");
      },
    });
    const view = await run(repo, [old, next]);
    const c = byKey(view.items);
    expect(c.dataIssues).toMatchObject({ state: "ok", count: 1, byFair: [{ exhibitionId: "next", count: 1 }] });
    expect(c.contacts).toEqual({ state: "unavailable", reason: "읽지 못했어요" });
  });
});

describe("loadAdminToday 표가 없을 때", () => {
  it("article 표가 없으면(0070 적용 전) 아티클만 준비 전이고 홈은 그대로 뜬다", async () => {
    const view = await run(
      fakeRepo({
        listArticles: async () => {
          throw new Error('아티클 조회 실패: relation "public.article" does not exist');
        },
        listEnrichmentCandidates: async () => [{ exhibitionId: "old" }],
      }),
    );
    const c = byKey(view.items);
    expect(c.articles).toEqual({ state: "unavailable", reason: "준비 전" });
    expect(c.drafts).toMatchObject({ state: "ok", count: 1 });
    // 준비 전은 0과 같이 아래로 가라앉는다.
    expect(view.items[0].key).toBe("drafts");
  });

  it("브랜드 그래프를 못 읽으면 인입 대기를 0으로 보이지 않는다", async () => {
    const view = await run(
      fakeRepo({
        loadExhibitorGraph: async () => {
          throw new Error("timeout");
        },
      }),
    );
    expect(byKey(view.items).intake).toEqual({ state: "unavailable", reason: "읽지 못했어요" });
    expect(view.pendingFiles).toBeNull();
  });
});

describe("readRepoFiles", () => {
  it("레포 data/를 읽고 링크 보충 파일과 밑줄 파일은 뺀다", () => {
    const files = readRepoFiles();
    expect(files).not.toBeNull();
    expect(files!.some((f) => f.kind === "exhibition" && f.slug === "sdf-2026")).toBe(true);
    expect(files!.some((f) => f.path.endsWith("-links.json") || f.path.includes("/_"))).toBe(false);
    // 행사가 정해지지 않은 브랜드 파일은 기다리는 행사가 없다.
    expect(files!.some((f) => f.path.includes("moongu-artists"))).toBe(false);
  });

  it("data/가 없으면 null", () => {
    expect(readRepoFiles("/nonexistent-roam-root")).toBeNull();
  });
});
