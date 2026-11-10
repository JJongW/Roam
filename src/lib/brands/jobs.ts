// 브랜드 초안 잡을 넣는 시점과 새 출전에 따른 stale 처리(2026-11-03 Ted 결정).
//
// 잡은 **박람회 단위로** 넣는다(2026-11-03 Ted 결정 — 첫 실행 규모를 박람회별로 나눈다).
//  - 관리자가 브랜드 목록에서 박람회를 고르고 "이 박람회 브랜드 초안 만들기"를 눌렀을 때
//  - 관리자가 브랜드 상세에서 "초안 만들기"를 눌렀을 때(브랜드 하나)
//  - 인입(박람회 하나)이 기존 브랜드에 새 출전을 이었을 때 — 그 박람회 출전만
// 백필(모든 박람회)은 잡을 넣지 않는다. 새 브랜드가 한꺼번에 1천 곳 넘게 큐에 들어가면
// 요금과 검수량을 가늠할 수 없어서다. stale 표시는 LLM이 없어 백필에서도 한다.
import type { Repository } from "@/lib/repositories/types";
import type { ExhibitorGraph } from "@/lib/types";
import type { ExhibitorPlan } from "@/lib/exhibitor/plan";
import { AI_DRAFT_FIELDS, introNeedsTone, staleOnNewAppearance, workerMayWrite } from "@/lib/brands/profile";

/** 워커가 채우는 칸 — 하나라도 쓸 수 있으면 초안이 필요한 브랜드다. */
const DRAFTABLE_FIELDS = ["links", "aliases", "intro", ...AI_DRAFT_FIELDS] as const;

export const BRAND_DRAFT_JOB = "brand_profile_draft";
/** 잡 하나에 담는 브랜드 수. 첫 백필은 1천 곳이 넘어서 잡을 나눈다. */
export const BRAND_DRAFT_CHUNK = 20;
export const STALE_ACTOR = "system:new-appearance";

/** 백필 전후 그래프 비교 — 새 브랜드, 새 출전이 이어진 기존 브랜드. 순수 함수. */
export function diffGraph(
  before: ExhibitorGraph,
  after: ExhibitorGraph,
): { newExhibitors: string[]; newAppearance: string[]; newAppearanceIn: { exhibitorId: string; exhibitionId: string }[] } {
  const oldEx = new Set(before.exhibitors.map((e) => e.id));
  const oldPt = new Set(before.participants.map((p) => p.id));
  const newExhibitors = after.exhibitors.filter((e) => !oldEx.has(e.id)).map((e) => e.id);
  const fresh = after.participants.filter((p) => !oldPt.has(p.id) && oldEx.has(p.exhibitorId));
  const newAppearance = [...new Set(fresh.map((p) => p.exhibitorId))];
  return { newExhibitors, newAppearance, newAppearanceIn: fresh.map((p) => ({ exhibitorId: p.exhibitorId, exhibitionId: p.exhibitionId })) };
}

/**
 * 초안 잡을 넣는다. 아직 처리 전인(queued) 같은 종류 잡에 이미 든 브랜드는 다시 넣지 않는다.
 * 반환은 넣은 잡 id와 브랜드 수.
 */
export async function enqueueBrandDrafts(
  repo: Repository,
  exhibitorIds: string[],
  opts: { actor: string | null; reason: string },
): Promise<{ jobIds: string[]; brands: number }> {
  const queued = await repo.listJobs({ type: BRAND_DRAFT_JOB, status: "queued", limit: 1000 });
  const already = new Set(queued.flatMap((j) => ((j.payload.exhibitorIds as string[] | undefined) ?? [])));
  const ids = [...new Set(exhibitorIds)].filter((id) => !already.has(id));
  const jobIds: string[] = [];
  for (let i = 0; i < ids.length; i += BRAND_DRAFT_CHUNK) {
    const job = await repo.enqueueJob({
      type: BRAND_DRAFT_JOB,
      payload: { exhibitorIds: ids.slice(i, i + BRAND_DRAFT_CHUNK), actor: opts.actor, reason: opts.reason },
    });
    jobIds.push(job.id);
  }
  return { jobIds, brands: ids.length };
}

/** 새 출전이 이어진 브랜드의 칸을 stale로 돌린다. 값과 출처는 그대로 둔다. */
export async function markStaleForNewAppearance(repo: Repository, exhibitorIds: string[]): Promise<number> {
  if (exhibitorIds.length === 0) return 0;
  const fields = await repo.listProfileFields({ exhibitorIds });
  let n = 0;
  for (const id of exhibitorIds) {
    const mine = fields.filter((f) => f.exhibitorId === id);
    for (const key of staleOnNewAppearance(mine)) {
      const f = mine.find((x) => x.field === key)!;
      await repo.upsertProfileField({
        subject: { exhibitorId: id },
        field: key,
        value: f.value,
        sources: f.sources,
        status: "stale",
        actor: STALE_ACTOR,
      });
      n++;
    }
  }
  return n;
}

/**
 * 연결 계획을 적용하고 뒤따르는 일(stale, 초안 잡)을 한다. 백필과 인입이 같이 쓴다 —
 * 두 경로의 규칙이 갈리면 안 된다.
 */
export async function applyLinkPlan(
  repo: Repository,
  plan: ExhibitorPlan,
  /** exhibitionId를 주면(인입) 그 박람회에 새 출전이 이어진 기존 브랜드만 잡에 넣는다.
   *  안 주면(백필) 잡을 넣지 않는다. */
  opts: { actor: string | null; exhibitionId?: string },
): Promise<{
  applied: Awaited<ReturnType<Repository["applyExhibitorPlan"]>>;
  newExhibitors: number;
  newAppearance: number;
  staled: number;
  enqueued: { jobIds: string[]; brands: number };
}> {
  const before = await repo.loadExhibitorGraph();
  const applied = await repo.applyExhibitorPlan(plan);
  const after = await repo.loadExhibitorGraph();
  const d = diffGraph(before, after);
  const staled = await markStaleForNewAppearance(repo, d.newAppearance);
  const scoped = opts.exhibitionId
    ? [...new Set(d.newAppearanceIn.filter((x) => x.exhibitionId === opts.exhibitionId).map((x) => x.exhibitorId))]
    : [];
  const enqueued = scoped.length
    ? await enqueueBrandDrafts(repo, scoped, { actor: opts.actor, reason: "이 박람회에 새 출전이 이어졌어요" })
    : { jobIds: [], brands: 0 };
  return { applied, newExhibitors: d.newExhibitors.length, newAppearance: d.newAppearance.length, staled, enqueued };
}

/** 박람회 하나의 브랜드에 초안 잡을 넣는다. 기본은 워커가 쓸 칸이 남은 브랜드만. */
export async function enqueueExhibitionDrafts(
  repo: Repository,
  exhibitionId: string,
  opts: { actor: string | null; onlyNeeded?: boolean },
): Promise<{ brands: number; complete: number; jobIds: string[] }> {
  const graph = await repo.loadExhibitorGraph();
  const inEx = new Set(graph.participants.filter((p) => p.exhibitionId === exhibitionId).map((p) => p.id));
  const primary = new Set(graph.assignments.filter((a) => a.role === "primary" && inEx.has(a.participantId)).map((a) => a.participantId));
  const ids = [...new Set(graph.participants.filter((p) => primary.has(p.id)).map((p) => p.exhibitorId))];
  let targets = ids;
  if (opts.onlyNeeded !== false && ids.length) {
    const fields = await repo.listProfileFields({ exhibitorIds: ids });
    targets = ids.filter(
      (id) =>
        DRAFTABLE_FIELDS.some((k) => workerMayWrite(fields.find((f) => f.exhibitorId === id && f.field === k))) ||
        introNeedsTone(fields.find((f) => f.exhibitorId === id && f.field === "intro")),
    );
  }
  const r = await enqueueBrandDrafts(repo, targets, { actor: opts.actor, reason: `박람회 ${exhibitionId} 브랜드 초안` });
  return { brands: r.brands, complete: ids.length - targets.length, jobIds: r.jobIds };
}
