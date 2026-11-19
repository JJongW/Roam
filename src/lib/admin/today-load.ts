import "server-only";
import type { Repository } from "@/lib/repositories/types";
import type { BoothListItem, Exhibition } from "@/lib/types";
import { loadContactBoard } from "@/lib/brands/board-load";
import { funnel } from "@/lib/brands/board";
import {
  articleQueue,
  dataIssueQueue,
  enrichmentQueue,
  issueGroups,
  pendingLinkCandidates,
  verifyQueue,
} from "@/lib/admin/queues";
import { FILE_KIND_LABEL, intakeQueue, readRepoFiles, type RepoFile } from "@/lib/intake/queue";
import {
  buildTodayItems,
  sumFairs,
  unavailableFrom,
  upcomingFairs,
  type FairFacts,
  type QueueCount,
  type QueueKey,
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

const fairRef = (e: Exhibition) => ({ exhibitionId: e.id, slug: e.slug, name: e.name });

export interface AdminToday {
  items: TodayItem[];
  upcoming: UpcomingFair[];
}

/**
 * 관리자 홈 맨 위 두 칸을 채운다. **숫자마다 그 큐 화면이 부르는 함수를 같은 범위로 부른다**
 * (lib/admin/queues.ts, lib/intake/queue.ts, lib/brands/board.ts의 funnel). 박람회 하나를 보는 큐는
 * 박람회마다 따로 불러 박람회별 줄로 보이고, 그 줄을 누르면 같은 숫자가 보이는 화면으로 간다.
 *
 * 홈이 이미 읽은 것(행사 목록, 행사별 부스 목록)은 받아서 다시 읽지 않는다.
 */
export async function loadAdminToday(
  repo: Repository,
  input: {
    exhibitions: Exhibition[];
    boothsByFair: Map<string, BoothListItem[]>;
    today: string;
    floorplanSlugs: Set<string>;
    repoFiles?: RepoFile[] | null;
  },
): Promise<AdminToday> {
  const { exhibitions, boothsByFair, today, floorplanSlugs } = input;
  const repoFiles = input.repoFiles === undefined ? readRepoFiles() : input.repoFiles;
  const notEnded = exhibitions.filter((e) => e.endDate >= today);
  const contactFairs = exhibitions.filter((e) => e.endDate >= addDays(today, -CONTACT_LOOKBACK_DAYS));

  // 브랜드 그래프는 브랜드 수와 인입 대기 둘이 같이 쓴다. 못 읽으면 브랜드 수는 모름(null).
  const graph = await repo.loadExhibitorGraph().catch(() => null);

  const [articles, contacts, brandLinks, drafts, verify, intake, errors, dataIssues] = await Promise.all([
    safely(async () => {
      // 0070 적용 전이면 article 표가 없어 throw한다. 홈은 "준비 전"으로 보여 준다.
      const q = await articleQueue(repo);
      return { state: "ok", count: q.drafts, atLeast: q.atLeast || undefined } as QueueCount;
    }),
    safely(async () =>
      sumFairs(
        await Promise.all(
          contactFairs.map(async (e) => {
            const { rows } = await loadContactBoard(repo, e, today);
            return { ...fairRef(e), count: funnel(rows).todo };
          }),
        ),
      ),
    ),
    safely(async () => ({ state: "ok", count: (await pendingLinkCandidates(repo)).length }) as QueueCount),
    safely(async () => {
      const per = await Promise.all(
        exhibitions.map(async (e) => {
          const q = await enrichmentQueue(repo, e.id);
          return { fair: { ...fairRef(e), count: q.forHuman.length, secondary: q.notFound.length }, atLeast: q.atLeast };
        }),
      );
      return sumFairs(
        per.map((p) => p.fair),
        per.some((p) => p.atLeast),
        "직접 조사",
      );
    }),
    safely(async () =>
      sumFairs(await Promise.all(exhibitions.map(async (e) => ({ ...fairRef(e), count: (await verifyQueue(repo, e)).rows.length })))),
    ),
    safely(async () => {
      if (!graph) return { state: "unavailable", reason: "읽지 못했어요" } as QueueCount;
      const items = await intakeQueue(repo, { today, exhibitions, graph, files: repoFiles });
      if (!items) return { state: "unavailable", reason: "읽지 못했어요" } as QueueCount;
      return { state: "ok", count: items.length, notes: items.map((i) => `${i.slug}: ${FILE_KIND_LABEL[i.kind]}`) } as QueueCount;
    }),
    safely(async () => ({ state: "ok", count: (await issueGroups(repo)).length }) as QueueCount),
    safely(async () =>
      sumFairs(await Promise.all(notEnded.map(async (e) => ({ ...fairRef(e), count: (await dataIssueQueue(repo, e.id)).count })))),
    ),
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
  };
}
