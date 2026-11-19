// 관리자 홈 카드 숫자 = 그 카드가 데려가는 화면 숫자(2026-11-19 Ted, 운영: "초안 검수 대기와 실제 초안 검수
// 페이지가 안 맞음, 인입 대기도 마찬가지"). 화면은 lib/admin/queues.ts와 lib/intake/queue.ts를 부른다.
// 여기서는 같은 픽스처로 홈 숫자와 그 함수 숫자가 박람회마다 같은지 본다.
import { describe, expect, it } from "vitest";
import { loadAdminToday } from "@/lib/admin/today-load";
import type { FairCount, QueueCount, QueueKey, TodayItem } from "@/lib/admin/today";
import {
  articleQueue,
  dataIssueQueue,
  enrichmentQueue,
  issueGroups,
  pendingLinkCandidates,
  splitPending,
  verifyQueue,
} from "@/lib/admin/queues";
import { intakeQueue, readRepoFiles, type RepoFile } from "@/lib/intake/queue";
import { loadContactBoard } from "@/lib/brands/board-load";
import { funnel } from "@/lib/brands/board";
import { DEFAULT_POLICY } from "@/lib/enrichment/review-policy";
import { MockRepository } from "@/lib/mock/repository";
import type { Repository } from "@/lib/repositories/types";
import type { Article, EnrichmentCandidate, Exhibition, IssueLog } from "@/lib/types";

/** mock 박람회가 전부 끝나지 않은 날. 데이터 이슈와 인입이 모든 박람회를 본다. */
const EARLY = "2026-01-01";

const byKey = (items: TodayItem[]) => Object.fromEntries(items.map((i) => [i.key, i.count])) as Record<QueueKey, QueueCount>;
const fairsOf = (c: QueueCount): FairCount[] => (c.state === "ok" ? (c.byFair ?? []) : []);
const fairCount = (c: QueueCount, id: string) => fairsOf(c).find((f) => f.exhibitionId === id);

const cand = (id: string, exhibitionId: string, over: Partial<EnrichmentCandidate> = {}): EnrichmentCandidate =>
  ({
    id,
    boothId: `booth-${id}`,
    exhibitionId,
    source: "drafter",
    payload: {},
    sources: [],
    confidence: 0.7,
    issues: [],
    status: "pending",
    createdAt: "2026-11-01T00:00:00Z",
    ...over,
  }) as EnrichmentCandidate;

async function fixture() {
  const repo = new MockRepository() as unknown as Repository;
  const { data: exhibitions } = await repo.listExhibitions({ limit: 50 });
  const [a, b] = exhibitions;
  const candidates = [
    cand("a1", a.id),
    cand("a2", a.id, { confidence: 0.99 }),
    // 재조사(근거 없음)는 사람 큐가 아니라 직접 조사 목록이다.
    cand("a3", a.id, { issues: [{ code: "no_sources", message: "", weight: 1 }] }),
    cand("a4", a.id, { status: "approved" }),
    cand("b1", b.id),
  ];
  const articles = [
    { id: "x1", status: "draft" },
    { id: "x2", status: "approved" },
    { id: "x3", status: "draft" },
  ] as Article[];
  const issues = [
    { id: "i1", message: "boom", source: "server", createdAt: "2026-11-18T00:00:00Z" },
    { id: "i2", message: "other", source: "client", createdAt: "2026-11-18T00:00:00Z" },
  ] as unknown as IssueLog[];
  Object.assign(repo, {
    listEnrichmentCandidates: async (o: { exhibitionId?: string; status?: string; limit?: number } = {}) =>
      candidates
        .filter((c) => (!o.exhibitionId || c.exhibitionId === o.exhibitionId) && (!o.status || c.status === o.status))
        .slice(0, o.limit ?? 100),
    listArticles: async () => articles,
    listIssues: async () => issues,
  });
  return { repo, exhibitions, a, b };
}

async function home(repo: Repository, exhibitions: Exhibition[], today: string, repoFiles: RepoFile[] | null = []) {
  const boothsByFair = new Map(
    await Promise.all(exhibitions.map(async (e) => [e.id, await repo.listBoothsByExhibitionId(e.id)] as const)),
  );
  return loadAdminToday(repo, { exhibitions, boothsByFair, today, floorplanSlugs: new Set(), repoFiles });
}

describe("홈 카드 숫자 = 화면 숫자", () => {
  it("초안 검수: 박람회마다 사람 몫(forHuman)과 직접 조사(notFound)가 화면과 같다", async () => {
    const { repo, exhibitions, a, b } = await fixture();
    const c = byKey((await home(repo, exhibitions, EARLY)).items).drafts;
    let total = 0;
    for (const e of exhibitions) {
      const q = await enrichmentQueue(repo, e.id);
      total += q.forHuman.length;
      const row = fairCount(c, e.id);
      expect(row?.count ?? 0, e.slug).toBe(q.forHuman.length);
      expect(row?.secondary ?? 0, e.slug).toBe(q.notFound.length);
    }
    expect(c).toMatchObject({ state: "ok", count: total, secondary: { label: "직접 조사", count: 1 } });
    // 옛 홈은 재조사와 다른 박람회까지 더해 4건이었다.
    expect(fairCount(c, a.id)).toMatchObject({ count: 2, secondary: 1 });
    expect(fairCount(c, b.id)).toMatchObject({ count: 1 });
  });

  it("대조 검수: 박람회마다 화면의 '다른 것' 수와 같다", async () => {
    const { repo, exhibitions } = await fixture();
    const c = byKey((await home(repo, exhibitions, EARLY)).items).verify;
    for (const e of exhibitions) expect(fairCount(c, e.id)?.count ?? 0, e.slug).toBe((await verifyQueue(repo, e)).rows.length);
  });

  it("아티클: 화면의 승인 대기 수와 같다", async () => {
    const { repo, exhibitions } = await fixture();
    const c = byKey((await home(repo, exhibitions, EARLY)).items).articles;
    expect(c).toMatchObject({ state: "ok", count: (await articleQueue(repo)).drafts });
    expect(c).toMatchObject({ count: 2 });
  });

  it("브랜드 연락: 박람회마다 화면의 '할 일 있는 브랜드' 수와 같다", async () => {
    const { repo, exhibitions } = await fixture();
    const c = byKey((await home(repo, exhibitions, EARLY)).items).contacts;
    for (const e of exhibitions) {
      const { rows } = await loadContactBoard(repo, e, EARLY);
      expect(fairCount(c, e.id)?.count ?? 0, e.slug).toBe(funnel(rows).todo);
    }
  });

  it("브랜드 확인: 연결 확인 목록 수와 같다", async () => {
    const { repo, exhibitions } = await fixture();
    const c = byKey((await home(repo, exhibitions, EARLY)).items).brandLinks;
    expect(c).toMatchObject({ state: "ok", count: (await pendingLinkCandidates(repo)).length });
  });

  it("오류: 오류 로그 탭의 묶은 수와 같다", async () => {
    const { repo, exhibitions } = await fixture();
    const c = byKey((await home(repo, exhibitions, EARLY)).items).errors;
    expect(c).toMatchObject({ state: "ok", count: (await issueGroups(repo)).length });
  });

  it("데이터 이슈: 박람회마다 데이터 이슈 탭 수(빈 칸 + 기록 어긋남)와 같다", async () => {
    const { repo, exhibitions } = await fixture();
    const c = byKey((await home(repo, exhibitions, EARLY)).items).dataIssues;
    let total = 0;
    for (const e of exhibitions) {
      const n = (await dataIssueQueue(repo, e.id)).count;
      total += n;
      expect(fairCount(c, e.id)?.count ?? 0, e.slug).toBe(n);
    }
    expect(c).toMatchObject({ count: total });
  });

  it("데이터 이슈: 끝난 박람회는 홈에서 세지 않는다", async () => {
    const { repo, exhibitions } = await fixture();
    const c = byKey((await home(repo, exhibitions, "2030-01-01")).items).dataIssues;
    expect(c).toMatchObject({ state: "ok", count: 0 });
  });

  it("인입: 인입 화면의 '올릴 파일' 수와 같다", async () => {
    const { repo, exhibitions } = await fixture();
    const files = readRepoFiles();
    for (const today of [EARLY, "2026-11-19"]) {
      const c = byKey((await home(repo, exhibitions, today, files)).items).intake;
      const items = await intakeQueue(repo, { today, files });
      expect(c, today).toMatchObject({ state: "ok", count: items!.length });
    }
  });
});

describe("intakeQueue", () => {
  const ex = (slug: string, startDate: string, endDate: string) =>
    ({ id: `id-${slug}`, slug, name: slug, startDate, endDate }) as Exhibition;
  const file = (kind: RepoFile["kind"], slug: string, extra: Partial<RepoFile> = {}): RepoFile => ({
    kind,
    path: `data/${kind}/${slug}.json`,
    slug,
    raw: {},
    ...extra,
  });
  const repo = {
    listBoothsFull: async () => [],
    listHalls: async () => [],
    listCategories: async () => [],
  } as unknown as Repository;

  it("끝난 박람회 파일은 세지 않고, 운영에 없는 박람회는 행사 행부터 기다린다", async () => {
    const items = await intakeQueue(repo, {
      today: "2026-11-19",
      exhibitions: [ex("cafeshow-2026", "2026-11-05", "2026-11-08")],
      graph: { exhibitors: [], participants: [], assignments: [], candidates: [] },
      files: [
        file("booths", "cafeshow-2026"),
        file("exhibition", "sdf-2026", { startDate: "2026-11-26", endDate: "2026-11-29", name: "SDF" }),
        file("brands", "sdf-2026"),
        // 날짜를 모르는 박람회는 끝났다고 보지 않는다.
        file("booths", "unknown-fair"),
      ],
    });
    expect(items!.map((i) => [i.path, i.change])).toEqual([
      ["data/exhibition/sdf-2026.json", "운영에 행사 행이 없어요"],
      ["data/brands/sdf-2026.json", "행사 행을 먼저 만들어야 해요"],
      ["data/booths/unknown-fair.json", "행사 행을 먼저 만들어야 해요"],
    ]);
  });

  it("레포 파일을 못 읽으면 null", async () => {
    expect(await intakeQueue(repo, { today: "2026-11-19", exhibitions: [], files: null })).toBeNull();
  });
});

describe("splitPending", () => {
  it("재조사 판정은 사람 몫에서 빠진다", () => {
    const s = splitPending(
      [cand("1", "a"), cand("2", "a", { issues: [{ code: "not_found", message: "", weight: 1 }] }), cand("3", "a", { confidence: 0.99 })],
      DEFAULT_POLICY,
    );
    expect(s.forHuman.map((c) => c.id)).toEqual(["1", "3"]);
    expect(s.notFound.map((c) => c.id)).toEqual(["2"]);
    expect(s.autoPassCount).toBe(2);
  });
});

describe("표가 없거나 못 읽을 때", () => {
  it("article 표가 없으면(0070 적용 전) 아티클만 준비 전이고 홈은 그대로 뜬다", async () => {
    const { repo, exhibitions } = await fixture();
    Object.assign(repo, {
      listArticles: async () => {
        throw new Error('아티클 조회 실패: relation "public.article" does not exist');
      },
    });
    const c = byKey((await home(repo, exhibitions, EARLY)).items);
    expect(c.articles).toEqual({ state: "unavailable", reason: "준비 전" });
    expect(c.drafts).toMatchObject({ state: "ok" });
  });

  it("브랜드 그래프를 못 읽으면 인입 대기를 0으로 보이지 않는다", async () => {
    const { repo, exhibitions } = await fixture();
    Object.assign(repo, {
      loadExhibitorGraph: async () => {
        throw new Error("timeout");
      },
    });
    expect(byKey((await home(repo, exhibitions, EARLY)).items).intake).toEqual({ state: "unavailable", reason: "읽지 못했어요" });
  });
});

describe("readRepoFiles", () => {
  it("레포 data/를 읽고 링크 보충 파일과 밑줄 파일, 행사 없는 브랜드 파일은 뺀다", () => {
    const files = readRepoFiles()!;
    expect(files.some((f) => f.kind === "exhibition" && f.slug === "sdf-2026")).toBe(true);
    expect(files.some((f) => f.path.endsWith("-links.json") || f.path.includes("/_"))).toBe(false);
    expect(files.some((f) => f.path.includes("moongu-artists"))).toBe(false);
  });

  it("data/가 없으면 null", () => {
    expect(readRepoFiles("/nonexistent-roam-root")).toBeNull();
  });
});
