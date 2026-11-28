import "server-only";
import type { Repository } from "@/lib/repositories/types";
import type { Article, EnrichmentCandidate, Exhibition } from "@/lib/types";
import { findBoothEnrichmentGaps, findNoteInconsistencies } from "@/lib/admin/data-issues";
import { groupIssues } from "@/lib/admin/issue-grouping";
import { exhaustedBooths, exhibitionTrust, reviewPolicy, type PolicyConfig } from "@/lib/enrichment/review-policy";
import { diffVerified, loadVerified } from "@/lib/verified";
import { loadBrandData } from "@/lib/brands/load";
import { buildLinkRows } from "@/lib/brands/links";

/**
 * 관리자 큐 하나당 함수 하나. **큐 화면과 관리자 홈이 같은 함수를 같은 범위로 부른다.**
 *
 * 왜(2026-11-19 Ted, 운영): 홈 카드 숫자가 누르면 가는 화면 숫자와 달랐다. 홈은 저장소를 따로
 * 불러 다른 범위(전 박람회, 다른 상한)와 다른 거르기(재조사 포함)로 셌기 때문이다. 화면이
 * 무엇을 보여 주는지 바꾸면 홈 숫자도 같이 바뀌어야 하니, 셈을 한 곳에 둔다.
 */

// ─── 초안 검수(/admin/enrichment) ────────────────────────────────────────

/** 검수 큐가 한 번에 읽는 pending 상한. 화면이 이만큼 그린다. 걸리면 "이상"으로 보인다. */
export const ENRICHMENT_PENDING_LIMIT = 100;
/** 문턱(믿을지)과 보정 표는 판단된 것 전부로 정한다. */
export const ENRICHMENT_REVIEWED_LIMIT = 1000;

/**
 * pending 초안을 사람 몫과 직접 조사할 몫으로 가른다. 순수.
 * - forHuman: 검수자가 승인하거나 반려할 초안(재조사 아님)
 * - notFound: 기계가 다시 찾아도 근거를 못 댄 초안. 사람이 직접 찾을 목록
 * - autoPassCount: forHuman 중 이 박람회 문턱이면 자동 통과했을 수
 */
export function splitPending(candidates: EnrichmentCandidate[], policy: PolicyConfig) {
  const decided = candidates.map((c) => ({ c, r: reviewPolicy(c.confidence, c.issues, policy) }));
  const forHuman = decided.filter((d) => d.r.decision !== "redraft").map((d) => d.c);
  const notFound = decided.filter((d) => d.r.decision === "redraft").map((d) => d.c);
  const autoPassCount = decided.filter((d) => d.r.decision !== "redraft" && d.r.wouldAutoPass).length;
  return { forHuman, notFound, autoPassCount };
}

/** 박람회 하나의 초안 검수 큐. 화면과 홈이 같이 부른다. */
export async function enrichmentQueue(repo: Repository, exhibitionId: string) {
  const [pending, reviewed] = await Promise.all([
    repo.listEnrichmentCandidates({ exhibitionId, status: "pending", limit: ENRICHMENT_PENDING_LIMIT }),
    // 보정 표는 **판단된 것 전부**를 봐야 한다. pending만으론 승인률이 안 나온다.
    repo.listEnrichmentCandidates({ exhibitionId, limit: ENRICHMENT_REVIEWED_LIMIT }),
  ]);
  // 이 박람회를 믿기로 했나. 화면과 실제 반영이 다른 문턱을 쓰면 "눌러도 안 줄어드는" 버튼이 생긴다.
  const trust = exhibitionTrust(reviewed);
  return {
    ...splitPending(pending, trust.policy),
    pending,
    reviewed,
    trust,
    giveUp: exhaustedBooths(reviewed),
    atLeast: pending.length >= ENRICHMENT_PENDING_LIMIT,
  };
}

/** 초안 검수 큐의 박람회 하나. count = 사람 몫(forHuman), secondary = 직접 조사(notFound). */
export interface DraftFairRow {
  exhibitionId: string;
  slug: string;
  name: string;
  count: number;
  secondary: number;
}

/**
 * 모든 박람회의 초안 검수 건수. **관리자 홈 카드와 초안 검수 화면의 "박람회별" 줄이 이것 하나를 같이 쓴다.**
 *
 * 왜(2026-11-28 Ted, 운영: "초안 검수 대기가 9개 있다는데 눌렀을 때 보여지는 건 없음"): 홈은 모든 박람회를
 * 더해 세는데, 카드를 누르면 화면은 쿠키나 오늘 기준으로 고른 박람회 하나(그날은 SDF, 0건)만 보여 줬다.
 * 9건은 끝난 박람회 둘(카페쇼 8, SIF 1)의 직접 조사였다. 화면이 같은 줄을 그리면 어느 박람회로 들어가도
 * 나머지 박람회의 건수가 보이고, 숫자를 따로 세는 길이 없어진다.
 */
export async function enrichmentQueueByFair(
  repo: Repository,
  exhibitions: Pick<Exhibition, "id" | "slug" | "name">[],
): Promise<{ rows: DraftFairRow[]; atLeast: boolean }> {
  const per = await Promise.all(
    exhibitions.map(async (e) => {
      const q = await enrichmentQueue(repo, e.id);
      return {
        row: { exhibitionId: e.id, slug: e.slug, name: e.name, count: q.forHuman.length, secondary: q.notFound.length },
        atLeast: q.atLeast,
      };
    }),
  );
  return { rows: per.map((p) => p.row), atLeast: per.some((p) => p.atLeast) };
}

// ─── 대조 검수(/admin/verify) ────────────────────────────────────────────

/** 박람회 하나의 대조 큐. 확인한 사실 파일이 없으면 부스를 읽지 않는다. */
export async function verifyQueue(repo: Repository, exhibition: Pick<Exhibition, "id" | "slug">) {
  const verified = loadVerified(exhibition.slug);
  if (Object.keys(verified).length === 0) return { verified, rows: [], same: 0 };
  // 대조는 요약 전 필드가 있어야 한다. 목록 조회는 좁혀 와서 쓰지 않는다.
  const booths = await repo.listBoothsFull(exhibition.id);
  return { verified, ...diffVerified(booths, verified) };
}

// ─── 아티클(/admin/articles) ─────────────────────────────────────────────

export const ARTICLE_LIST_LIMIT = 200;

/**
 * 아티클 목록과 승인 대기(draft) 수. 0070 적용 전이면 article 표가 없어 throw한다.
 * 호출부가 잡아서 "준비 전"으로 보여 준다(빈 목록으로 위장하지 않는다).
 */
export async function articleQueue(repo: Repository): Promise<{ rows: Article[]; drafts: number; atLeast: boolean }> {
  const rows = await repo.listArticles({ limit: ARTICLE_LIST_LIMIT });
  return {
    rows,
    drafts: rows.filter((a) => a.status === "draft").length,
    atLeast: rows.length >= ARTICLE_LIST_LIMIT,
  };
}

// ─── 브랜드 확인(/admin/brands/links) ────────────────────────────────────

/**
 * 이름만 같아 사람이 확인할 연결 후보. 판단 단위는 참가다 — 부스 없는 참가(brands.v1)의 후보도
 * 여기 든다(0073, 2026-11-20 Ted). 화면은 brandLinkRows로 이 목록을 한 줄씩 그린다(1:1).
 */
export function pendingLinkCandidates(repo: Repository) {
  return repo.listExhibitorLinkCandidates("pending");
}

/** 연결 확인 화면이 그리는 줄. 홈 숫자(pendingLinkCandidates 수)와 같아야 한다(today-load.test.ts). */
export async function brandLinkRows(repo: Repository) {
  const [data, pending] = await Promise.all([loadBrandData(repo), pendingLinkCandidates(repo)]);
  return buildLinkRows({ ...data, candidates: pending });
}

// ─── 오류(/admin/errors 오류 로그) ───────────────────────────────────────

export const ISSUE_WINDOW = { limit: 1000, sinceDays: 30 } as const;

/** 최근 30일 오류를 묶은 것. 화면의 "묶어서 N건"과 홈 숫자가 같다. */
export async function issueGroups(repo: Repository) {
  return groupIssues(await repo.listIssues(ISSUE_WINDOW));
}

// ─── 데이터 이슈(/admin/errors 데이터 이슈) ──────────────────────────────

/** 박람회 하나의 데이터 이슈. 필수 칸 빔과 노트 정합성 둘 다 센다(화면 탭과 같다). */
export async function dataIssueQueue(repo: Repository, exhibitionId: string) {
  const booths = await repo.listBoothsByExhibitionId(exhibitionId);
  const notes = await repo.listNotesByBoothIds(booths.map((b) => b.id));
  const gaps = findBoothEnrichmentGaps(booths);
  const inconsistencies = findNoteInconsistencies(notes);
  return { gaps, inconsistencies, count: gaps.length + inconsistencies.length };
}
