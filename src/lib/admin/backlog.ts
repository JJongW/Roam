/**
 * 검수 적체 — "사람을 기다리는 일이 며칠 묵었나"를 한 질문으로 묶는다.
 *
 * 왜 admin 화면을 긁지 않고 여기 두는가: admin은 코드 게이트 뒤의 RSC다. HTML을
 * 긁으면 화면을 고칠 때마다 알림이 조용히 깨진다. 같은 저장소 함수를 부르면
 * 화면이 보는 것과 같은 사실을 본다. 순수 집계라 테스트도 여기서 된다.
 */
import type { Repository } from "@/lib/repositories/types";

/** 며칠을 넘기면 "사람이 안 보고 있다"로 본다. */
export const DEFAULT_STALE_DAYS = 3;
/** 잡은 기준이 다르다 — 하루 넘게 안 집혔으면 워커가 멈춘 것이다. */
export const STALE_JOB_DAYS = 1;
/** 한 번에 읽는 상한. 저장소의 limit은 하드 캡이고 정렬이 confidence desc라,
 *  여기 걸리면 "가장 오래된 것"조차 못 본다 — 그래서 걸렸는지를 표시한다. */
export const SCAN_LIMIT = { candidates: 2000, jobs: 500 } as const;

/** 한 묶음의 집계. `atLeast`면 조회 상한에 걸려 실제 수가 더 많다. */
export interface Bucket {
  count: number;
  oldestDays: number;
  atLeast: boolean;
}

export interface Backlog {
  staleDays: number;
  /** 묵은 검수 대기 초안. 참가사 셀프 폼·주최 측 제출도 같은 큐를 탄다. */
  drafts: Bucket;
  /** 이름만 같아 사람이 확인해야 하는 브랜드 신원 후보. */
  brands: Bucket;
  /** 하루 넘게 안 집힌 잡 — 워커가 멈춘 신호. */
  stuckJobs: Bucket;
  failedJobs: Bucket;
  /** 묵음 여부와 무관한 전체 대기 건수(로그용). */
  pending: { drafts: number; brands: number; queued: number };
}

const ageDays = (iso: string, now: number) => (now - Date.parse(iso)) / 86_400_000;

function bucket(
  rows: { createdAt: string }[],
  minDays: number,
  now: number,
  scanLimit: number,
): Bucket {
  const stale = rows.filter((r) => ageDays(r.createdAt, now) >= minDays);
  return {
    count: stale.length,
    oldestDays: Math.floor(
      stale.reduce((m, r) => Math.max(m, ageDays(r.createdAt, now)), 0),
    ),
    // 읽은 수가 상한과 같으면 더 있는 것이다. 상한을 전체로 보고하면
    // 조회 한계가 사실로 둔갑한다(CLAUDE.md "없음과 비어 있음").
    atLeast: rows.length >= scanLimit,
  };
}

export async function collectBacklog(
  repo: Repository,
  opts: { staleDays?: number; now?: number } = {},
): Promise<Backlog> {
  const staleDays = opts.staleDays ?? DEFAULT_STALE_DAYS;
  const now = opts.now ?? Date.now();
  const [drafts, brands, queued, failed] = await Promise.all([
    repo.listEnrichmentCandidates({ status: "pending", limit: SCAN_LIMIT.candidates }),
    // 이쪽은 상한 인자가 없다 — 전부 준다.
    repo.listExhibitorLinkCandidates("pending"),
    repo.listJobs({ status: "queued", limit: SCAN_LIMIT.jobs }),
    repo.listJobs({ status: "failed", limit: SCAN_LIMIT.jobs }),
  ]);
  return {
    staleDays,
    drafts: bucket(drafts, staleDays, now, SCAN_LIMIT.candidates),
    brands: bucket(brands, staleDays, now, Infinity),
    stuckJobs: bucket(queued, STALE_JOB_DAYS, now, SCAN_LIMIT.jobs),
    failedJobs: bucket(failed, 0, now, SCAN_LIMIT.jobs),
    pending: { drafts: drafts.length, brands: brands.length, queued: queued.length },
  };
}

/**
 * 보낼 문장. 적체가 없으면 null — 조용한 날엔 아무것도 보내지 않는다.
 * 매일 "이상 없음"이 오면 아무도 안 읽고, 그러면 정작 적체가 생긴 날에도 안 읽는다.
 */
export function formatBacklog(b: Backlog, appUrl = ""): string | null {
  const n = (x: Bucket) => `${x.count}건${x.atLeast ? " 이상" : ""}`;
  const age = (x: Bucket) =>
    `가장 오래된 것 ${x.oldestDays}일${x.atLeast ? " 이상" : ""}`;

  const lines: string[] = [];
  if (b.drafts.count) lines.push(`• 검수 대기 초안 ${n(b.drafts)} — ${age(b.drafts)}`);
  if (b.brands.count) lines.push(`• 확인 안 된 브랜드 신원 ${n(b.brands)} — ${age(b.brands)}`);
  if (b.stuckJobs.count)
    lines.push(`• 하루 넘게 안 집힌 잡 ${n(b.stuckJobs)} — 워커가 멈췄을 수 있음`);
  if (b.failedJobs.count) lines.push(`• 실패한 잡 ${n(b.failedJobs)}`);
  if (!lines.length) return null;

  const app = appUrl.replace(/\/+$/, "");
  return [
    `*Roam 검수 적체* (${b.staleDays}일 기준)`,
    ...lines,
    app ? `<${app}/admin/enrichment|검수 큐 열기>` : "",
  ]
    .filter(Boolean)
    .join("\n");
}
