/**
 * 브랜드 먼저 인입 — 저장소와 맞닿는 쪽. 계획은 brands-plan.ts(순수)가 세운다.
 *
 * `/api/admin/intake`가 brands.v1 파일을 받으면 여기로 온다. 미리보기(apply=false)는 계획만,
 * 적용은 매번 저장소에서 계획을 다시 세운 뒤 쓴다(intake.v1과 같다 — 미리보기와 적용 사이에
 * 누가 칸을 채웠으면 그 칸은 건너뛴다).
 */
import type { Repository } from "@/lib/repositories/types";
import type { AuditContext } from "@/lib/audit/diff";
import { diffFields } from "@/lib/audit/diff";
import { AUDIT_SPECS } from "@/lib/audit/entities";
import { existingExhibitors } from "@/lib/exhibitor/service";
import { diffGraph, enqueueBrandDrafts, markStaleForNewAppearance } from "@/lib/brands/jobs";
import { existingTargets, planBrands, type BrandsPlan } from "./brands-plan";
import type { BrandsFile } from "./brands-schema";

/** 사람이 아닌 경로로 칸을 썼다는 표시. 관리자가 적용했으면 그 사람 id가 앞선다. */
export const BRANDS_INTAKE_ACTOR = "system:brands-intake";

export async function planBrandsFromRepository(
  repo: Repository,
  file: BrandsFile,
): Promise<{ ok: true; plan: BrandsPlan } | { ok: false; message: string }> {
  let exhibitionId: string | null = null;
  if (file.exhibitionSlug) {
    exhibitionId = await repo.getExhibitionIdBySlug(file.exhibitionSlug);
    if (!exhibitionId) return { ok: false, message: `행사를 찾을 수 없어요: ${file.exhibitionSlug}` };
  }
  const exhibitions = await repo.listExhibitions({ limit: 200 });
  // 신원 키는 부스 링크에서도 온다 — 전 필드 조회(listBoothsFull)를 쓴다(CLAUDE.md "없음 ≠ 비어 있음").
  const [graph, ...perExhibition] = await Promise.all([
    repo.loadExhibitorGraph(),
    ...exhibitions.data.map((e) => repo.listBoothsFull(e.id)),
  ]);
  const existing = existingExhibitors(graph, perExhibition.flat());
  const base = { file, exhibitionId, graph, existing };
  // 두 번 세운다: 처음엔 어느 기존 브랜드에 이어지는지 보고, 그 브랜드들의 칸만 읽어 다시 세운다.
  const first = planBrands(base);
  const ids = existingTargets(first);
  if (ids.length === 0) return { ok: true, plan: first };
  const fields = await repo.listProfileFields({ exhibitorIds: ids });
  const filledFields = new Map<string, Set<string>>();
  for (const f of fields) {
    if (!f.exhibitorId) continue;
    if (!filledFields.has(f.exhibitorId)) filledFields.set(f.exhibitorId, new Set());
    filledFields.get(f.exhibitorId)!.add(f.field);
  }
  return { ok: true, plan: planBrands({ ...base, filledFields }) };
}

export interface BrandsApplyResult {
  createdBrands: number;
  createdParticipants: number;
  filledFields: number;
  /** 새 출전이 이어진 기존 브랜드의 칸을 stale로 돌린 수(lib/brands/jobs.ts와 같은 규칙). */
  staled: number;
  enqueued: { jobIds: string[]; brands: number };
  failures: { key: string; message: string }[];
}

export async function applyBrandsPlan(repo: Repository, plan: BrandsPlan, audit: AuditContext): Promise<BrandsApplyResult> {
  const result: BrandsApplyResult = {
    createdBrands: 0,
    createdParticipants: 0,
    filledFields: 0,
    staled: 0,
    enqueued: { jobIds: [], brands: 0 },
    failures: [],
  };
  const before = await repo.loadExhibitorGraph();

  // 1) 브랜드와 참가 사실. 한 번에 쓴다 — 참가 사실이 새 브랜드 id를 참조한다.
  const xp = plan.exhibitorPlan;
  let ids: { exhibitors: Record<string, string>; participants: Record<string, string> } = { exhibitors: {}, participants: {} };
  if (xp.exhibitors.length || xp.participants.length) {
    try {
      const applied = await repo.applyExhibitorPlan(xp);
      ids = applied.ids;
      result.createdBrands = applied.exhibitors;
      result.createdParticipants = applied.participants;
    } catch (e) {
      // 브랜드를 못 만들면 칸도 쓸 곳이 없다. 기존 브랜드 칸만 계속한다.
      result.failures.push({ key: "brands", message: msg(e) });
    }
  }
  const resolve = (r: BrandsPlan["fields"][number]["target"]) => ("existing" in r ? r.existing : ids.exhibitors[r.new]);

  // 변경 이력 — intake.v1과 같은 원장(change_log, source "intake").
  for (const e of xp.exhibitors) {
    const id = ids.exhibitors[e.key];
    if (!id) continue;
    await repo.recordChange({
      entity: "exhibitor",
      entityId: id,
      scopeId: plan.exhibitionId,
      ...audit,
      fieldDiffs: diffFields(
        null,
        {
          canonicalName: e.canonicalName,
          legalName: e.legalName,
          aliases: e.aliases,
          instagramUrl: e.instagramUrl,
          websiteUrl: e.websiteUrl,
          metadata: e.metadata,
        },
        AUDIT_SPECS.exhibitor.fields,
      ),
    });
  }
  for (const p of xp.participants) {
    const id = ids.participants[p.key];
    const exhibitorId = "existing" in p.exhibitorRef ? p.exhibitorRef.existing : ids.exhibitors[p.exhibitorRef.new];
    if (!id) continue;
    await repo.recordChange({
      entity: "exhibition_participant",
      entityId: id,
      scopeId: p.exhibitionId,
      ...audit,
      fieldDiffs: diffFields(
        null,
        {
          exhibitorId,
          exhibitionId: p.exhibitionId,
          displayName: p.displayName,
          aliases: p.aliases,
          sourceUrls: p.sourceUrls,
          metadata: p.metadata,
        },
        AUDIT_SPECS.exhibition_participant.fields,
      ),
    });
  }

  // 2) 프로필 칸 — 쓰기 직전에 한 번 더 비었는지 본다.
  const targets = [...new Set(plan.fields.map((f) => resolve(f.target)).filter((x): x is string => !!x))];
  const now = targets.length ? await repo.listProfileFields({ exhibitorIds: targets }) : [];
  const has = new Set(now.map((f) => `${f.exhibitorId}|${f.field}`));
  for (const f of plan.fields) {
    const exhibitorId = resolve(f.target);
    if (!exhibitorId) {
      result.failures.push({ key: f.brandKey, message: `${f.field}: 브랜드가 만들어지지 않아 건너뛰어요` });
      continue;
    }
    if (has.has(`${exhibitorId}|${f.field}`)) continue;
    try {
      const saved = await repo.upsertProfileField({
        subject: { exhibitorId },
        field: f.field,
        value: f.value,
        sources: f.sources,
        status: f.status,
        actor: audit.actor ?? BRANDS_INTAKE_ACTOR,
      });
      if (!saved) {
        result.failures.push({ key: f.brandKey, message: `${f.field}: 브랜드를 찾을 수 없어요` });
        continue;
      }
      has.add(`${exhibitorId}|${f.field}`);
      result.filledFields++;
      await repo.recordChange({
        entity: "brand_profile_field",
        entityId: saved.id,
        scopeId: exhibitorId,
        ...audit,
        fieldDiffs: diffFields(
          null,
          { value: saved.value, status: saved.status, sources: saved.sources },
          AUDIT_SPECS.brand_profile_field.fields,
        ),
      });
    } catch (e) {
      result.failures.push({ key: f.brandKey, message: `${f.field}: ${msg(e)}` });
    }
  }

  // 3) 새 출전이 이어진 기존 브랜드 — 부스 인입(applyLinkPlan)과 같은 뒤처리.
  // 부스가 나중에 들어오면 참가 사실은 이미 있어서 그때는 "새 출전"으로 안 보인다. 그래서 지금 한다.
  try {
    const after = await repo.loadExhibitorGraph();
    const d = diffGraph(before, after);
    result.staled = await markStaleForNewAppearance(repo, d.newAppearance);
    const scoped = plan.exhibitionId
      ? [...new Set(d.newAppearanceIn.filter((x) => x.exhibitionId === plan.exhibitionId).map((x) => x.exhibitorId))]
      : [];
    if (scoped.length)
      result.enqueued = await enqueueBrandDrafts(repo, scoped, { actor: audit.actor ?? null, reason: "이 박람회에 새 출전이 이어졌어요" });
  } catch (e) {
    result.failures.push({ key: "followups", message: msg(e) });
  }
  return result;
}

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
