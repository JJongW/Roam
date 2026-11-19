import "server-only";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Repository } from "@/lib/repositories/types";
import type { BoothListItem, Exhibition, IssueLog } from "@/lib/types";
import { SCAN_LIMIT } from "@/lib/admin/backlog";
import { findBoothEnrichmentGaps } from "@/lib/admin/data-issues";
import { groupIssues } from "@/lib/admin/issue-grouping";
import { loadContactBoard } from "@/lib/brands/board-load";
import { diffVerified, loadVerified } from "@/lib/verified";
import {
  buildTodayItems,
  countByFair,
  pendingFileNotes,
  pendingRepoFiles,
  sumFairs,
  unavailableFrom,
  upcomingFairs,
  type FairFacts,
  type QueueCount,
  type QueueKey,
  type RepoFile,
  type TodayItem,
  type UpcomingFair,
} from "@/lib/admin/today";

/** 연락 할 일은 끝난 지 이만큼 지난 박람회까지 본다. 사진 허락 답장은 행사 뒤에도 온다. */
export const CONTACT_LOOKBACK_DAYS = 30;

/**
 * 한 칸이 실패해도 홈 전체가 죽지 않게 한다. 실패는 0건이 아니라 "읽지 못했어요"나 "준비 전"으로 보인다.
 */
async function safely(fn: () => Promise<QueueCount>): Promise<QueueCount> {
  try {
    return await fn();
  } catch (e) {
    return unavailableFrom(e);
  }
}

function addDays(iso: string, days: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

const fairRef = (e: Exhibition) => ({ id: e.id, slug: e.slug, name: e.name });

/**
 * 레포 data/ 아래 인입 파일 목록. 못 읽으면 null(배포 번들에 data/가 빠졌을 때) — 0건으로 위장하지 않는다.
 * 밑줄로 시작하는 파일(_backup, _review)과 링크 보충 파일(-links)은 인입 계약 파일이 아니라 뺀다.
 */
export function readRepoFiles(root = process.cwd()): RepoFile[] | null {
  const read = (dir: string) => {
    const abs = join(root, "data", dir);
    if (!existsSync(abs)) return [];
    return readdirSync(abs)
      .filter((f) => f.endsWith(".json") && !f.startsWith("_") && !f.endsWith("-links.json"))
      .map((f) => ({ path: `data/${dir}/${f}`, json: JSON.parse(readFileSync(join(abs, f), "utf8")) as Record<string, unknown> }));
  };
  try {
    if (!existsSync(join(root, "data"))) return null;
    const out: RepoFile[] = [];
    for (const { path, json } of read("exhibitions")) {
      if (typeof json.slug !== "string") continue;
      out.push({
        kind: "exhibition",
        path,
        slug: json.slug,
        name: typeof json.name === "string" ? json.name : undefined,
        startDate: typeof json.startDate === "string" ? json.startDate : undefined,
        endDate: typeof json.endDate === "string" ? json.endDate : undefined,
      });
    }
    for (const { path, json } of read("brands")) {
      // 행사가 정해지지 않은 브랜드 파일(exhibitionSlug: null)은 기다리는 행사가 없다.
      if (typeof json.exhibitionSlug !== "string") continue;
      out.push({ kind: "brands", path, slug: json.exhibitionSlug, size: Array.isArray(json.brands) ? json.brands.length : undefined });
    }
    for (const { path, json } of read("intake")) {
      if (typeof json.exhibitionSlug !== "string") continue;
      out.push({ kind: "booths", path, slug: json.exhibitionSlug, size: Array.isArray(json.booths) ? json.booths.length : undefined });
    }
    return out;
  } catch {
    return null;
  }
}

export interface AdminToday {
  items: TodayItem[];
  upcoming: UpcomingFair[];
  /** 레포에 있고 운영에 아직 없는 인입 파일. 레포 파일을 못 읽었으면 null. */
  pendingFiles: RepoFile[] | null;
}

/**
 * 관리자 홈 맨 위 두 칸을 채운다. 건수는 각 큐 화면이 쓰는 저장소 함수와 계산을 그대로 쓴다
 * (초안 검수 = listEnrichmentCandidates pending, 대조 = diffVerified, 연락 = loadContactBoard의 flags,
 * 브랜드 확인 = listExhibitorLinkCandidates pending, 오류 = groupIssues, 데이터 이슈 = findBoothEnrichmentGaps).
 *
 * 홈이 이미 읽은 것(행사 목록, 행사별 부스 목록, 오류 로그)은 받아서 다시 읽지 않는다.
 */
export async function loadAdminToday(
  repo: Repository,
  input: {
    exhibitions: Exhibition[];
    boothsByFair: Map<string, BoothListItem[]>;
    issues: IssueLog[];
    today: string;
    floorplanSlugs: Set<string>;
    repoFiles?: RepoFile[] | null;
  },
): Promise<AdminToday> {
  const { exhibitions, boothsByFair, issues, today, floorplanSlugs } = input;
  const repoFiles = input.repoFiles === undefined ? readRepoFiles() : input.repoFiles;
  const notEnded = exhibitions.filter((e) => e.endDate >= today);
  const contactFairs = exhibitions.filter((e) => e.endDate >= addDays(today, -CONTACT_LOOKBACK_DAYS));
  const verifyFairs = exhibitions
    .map((e) => ({ e, verified: loadVerified(e.slug) }))
    .filter((x) => Object.keys(x.verified).length > 0);

  // 브랜드 그래프는 브랜드 수와 인입 대기 둘이 같이 쓴다. 못 읽으면 브랜드 수는 모름(null).
  const graphP = repo.loadExhibitorGraph().catch(() => null);

  const [articles, contacts, brandLinks, drafts, verify, graph] = await Promise.all([
    safely(async () => {
      // 0070 적용 전이면 article 표가 없어 throw한다 — 홈은 "준비 전"으로 보여 준다.
      const rows = await repo.listArticles({ status: ["draft"], limit: 200 });
      return { state: "ok", count: rows.length, atLeast: rows.length >= 200 || undefined } as QueueCount;
    }),
    safely(async () => {
      const boards = await Promise.all(
        contactFairs.map(async (e) => {
          const { rows } = await loadContactBoard(repo, e, today);
          return { exhibitionId: e.id, slug: e.slug, name: e.name, count: rows.filter((r) => r.flags.length > 0).length };
        }),
      );
      return sumFairs(boards);
    }),
    safely(async () => {
      const rows = await repo.listExhibitorLinkCandidates("pending");
      return { state: "ok", count: rows.length } as QueueCount;
    }),
    safely(async () => {
      const rows = await repo.listEnrichmentCandidates({ status: "pending", limit: SCAN_LIMIT.candidates });
      return sumFairs(countByFair(rows, exhibitions.map(fairRef)), rows.length >= SCAN_LIMIT.candidates);
    }),
    safely(async () => {
      const per = await Promise.all(
        verifyFairs.map(async ({ e, verified }) => {
          // 대조는 요약 전 필드가 있어야 한다 — 목록 조회는 좁혀 와서 쓰지 않는다(화면과 같은 listBoothsFull).
          const booths = await repo.listBoothsFull(e.id);
          return { ...fairRef(e), exhibitionId: e.id, count: diffVerified(booths, verified).rows.length };
        }),
      );
      return sumFairs(per);
    }),
    graphP,
  ]);

  const brandCountOf = (id: string): number | null =>
    graph ? graph.participants.filter((p) => p.exhibitionId === id).length : null;
  const facts: FairFacts[] = exhibitions.map((e) => ({
    id: e.id,
    slug: e.slug,
    name: e.name,
    startDate: e.startDate,
    endDate: e.endDate,
    boothCount: (boothsByFair.get(e.id) ?? []).filter((b) => (b.kind ?? "exhibitor") === "exhibitor").length,
    brandCount: brandCountOf(e.id),
  }));

  // 브랜드 수를 모르면 brands.v1 파일이 반영됐는지도 모른다 — 인입 대기를 세지 않는다.
  const pendingFiles = repoFiles && graph ? pendingRepoFiles(repoFiles, facts) : null;
  const intake: QueueCount = pendingFiles
    ? { state: "ok", count: pendingFiles.length, notes: pendingFileNotes(pendingFiles) }
    : { state: "unavailable", reason: "읽지 못했어요" };

  const errors: QueueCount = { state: "ok", count: groupIssues(issues).length };
  const dataIssues = sumFairs(
    notEnded.map((e) => ({
      ...fairRef(e),
      exhibitionId: e.id,
      count: findBoothEnrichmentGaps(boothsByFair.get(e.id) ?? []).length,
    })),
  );

  const counts: Record<QueueKey, QueueCount> = {
    articles,
    contacts,
    brandLinks,
    drafts,
    verify,
    intake,
    errors,
    dataIssues,
  };
  return {
    items: buildTodayItems(counts),
    upcoming: upcomingFairs({ fairs: facts, files: repoFiles ?? [], floorplanSlugs, today }),
    pendingFiles,
  };
}
