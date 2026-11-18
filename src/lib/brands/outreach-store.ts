import "server-only";
import type { Repository } from "@/lib/repositories/types";
import { emptyView, splitPatch, type ActionPlan, type ContactView } from "@/lib/brands/contact-actions";
import type { BrandContact, BrandContactChannel, BrandContactStatus, BrandContactLog, BrandOutreach, BrandOutreachLog, ExhibitorGraph, ParticipantPermission } from "@/lib/types";

/**
 * 연락 보드의 저장 길목. 화면과 API는 출전(participantId)과 브랜드(exhibitorId)만 말하고,
 * 어디에 저장되는지는 여기서 정한다.
 *
 * - participant(목표): 브랜드 연락처 brand_outreach + 브랜드 VOC brand_outreach_log + 출전 허락
 *   participant_permission. 부스가 없어도 된다. 정규화 초안 STEP 1이 운영에 적용돼야 쓴다
 *   (`repo.hasParticipantOutreach()`). mock은 늘 이쪽이다.
 * - booth(옛 길, 폴백): 0061 brand_contact, brand_contact_log. 출전의 대표 부스로 찾아 쓴다.
 *   부스가 없는 출전은 읽기만 되고, 연락 금지(do_not_contact)는 칸이 없어 저장하지 않는다.
 *   2026-11-17 운영 brand_contact는 0행이라 옮길 데이터가 없다.
 */
export type OutreachMode = "participant" | "booth";

export interface ContactSubject {
  participantId: string;
  exhibitorId: string;
  exhibitionId: string;
  /** 대표 배정 부스. 없으면 null(자리 아직 모름). */
  boothId: string | null;
}

export interface LogItem {
  id: string;
  participantId: string | null;
  direction: BrandContactLog["direction"];
  kind: BrandContactLog["kind"];
  channel: BrandContactChannel | null;
  summary: string;
  actor: string | null;
  occurredAt: string;
}

export interface SubjectState {
  view: ContactView;
  /** 이 출전 이야기 + 브랜드 전체 이야기(participantId 없음). 최근 것 먼저. */
  logs: LogItem[];
  writable: boolean;
  /** 저장된 행이 하나라도 있나(없으면 빈 값을 보여 준 것). */
  saved: boolean;
  updatedBy: string | null;
  updatedAt: string | null;
}

export interface OutreachStore {
  mode: OutreachMode;
  read(subjects: ContactSubject[]): Promise<Map<string, SubjectState>>;
  /**
   * 출전별 연락 상태만(목록 배지용). 기록과 연락처는 읽지 않는다.
   * 저장된 행이 없는 출전은 빠진다 — 화면이 "보내지 않음"으로 본다.
   */
  statuses(subjects: ContactSubject[]): Promise<Map<string, BrandContactStatus>>;
  /** 계획 하나를 저장하고 기록을 남긴 뒤 새 상태를 돌려준다. 저장할 수 없으면 reason. */
  apply(
    subject: ContactSubject,
    plan: Extract<ActionPlan, { ok: true }>,
    actor: string | null,
  ): Promise<{ ok: true; state: SubjectState; log: LogItem } | { ok: false; reason: string }>;
}

export const READ_ONLY_REASON = "부스가 아직 없는 브랜드라 지금은 저장할 수 없어요(스키마 정리 STEP 1 뒤에 열려요)";
const DNC_REASON = "연락 금지는 스키마 정리(STEP 1) 뒤에 저장돼요";

export async function getOutreachStore(repo: Repository): Promise<OutreachStore> {
  return (await repo.hasParticipantOutreach()) ? participantStore(repo) : boothStore(repo);
}

/** 그래프에서 출전들의 주인 브랜드, 박람회, 대표 부스. 없는 출전은 빠진다. */
export function subjectsFromGraph(graph: ExhibitorGraph, participantIds?: string[]): ContactSubject[] {
  const want = participantIds ? new Set(participantIds) : null;
  const boothOf = new Map<string, string>();
  for (const a of graph.assignments) if (a.role === "primary" && !boothOf.has(a.participantId)) boothOf.set(a.participantId, a.boothId);
  return graph.participants
    .filter((p) => !want || want.has(p.id))
    .map((p) => ({ participantId: p.id, exhibitorId: p.exhibitorId, exhibitionId: p.exhibitionId, boothId: boothOf.get(p.id) ?? null }));
}

const byRecent = (a: LogItem, b: LogItem) => b.occurredAt.localeCompare(a.occurredAt);

// --- 목표 모양 ---------------------------------------------------------------

function viewOf(perm: ParticipantPermission | undefined, out: BrandOutreach | undefined): ContactView {
  const v = emptyView();
  if (perm) {
    Object.assign(v, {
      status: perm.status,
      sentAt: perm.sentAt,
      reply: perm.reply,
      allowedUse: perm.allowedUse,
      photoSource: perm.photoSource,
      textSource: perm.textSource,
      notes: perm.notes,
      checklist: perm.checklist,
    });
  }
  if (out) Object.assign(v, { handle: out.handle, channel: out.channel, doNotContact: out.doNotContact });
  return v;
}

const fromOutreachLog = (l: BrandOutreachLog): LogItem => ({
  id: l.id,
  participantId: l.participantId,
  direction: l.direction,
  kind: l.kind,
  channel: l.channel,
  summary: l.summary,
  actor: l.actor,
  occurredAt: l.occurredAt,
});

function participantStore(repo: Repository): OutreachStore {
  async function read(subjects: ContactSubject[]) {
    const exhibitionIds = [...new Set(subjects.map((s) => s.exhibitionId))];
    const exhibitorIds = [...new Set(subjects.map((s) => s.exhibitorId))];
    const [perms, outs, logs] = await Promise.all([
      Promise.all(exhibitionIds.map((id) => repo.listParticipantPermissions(id))).then((x) => x.flat()),
      exhibitorIds.length ? repo.listBrandOutreach(exhibitorIds) : Promise.resolve([]),
      exhibitorIds.length ? repo.listBrandOutreachLogs(exhibitorIds) : Promise.resolve([]),
    ]);
    const permBy = new Map(perms.map((p) => [p.participantId, p]));
    const outBy = new Map(outs.map((o) => [o.exhibitorId, o]));
    const logsBy = new Map<string, BrandOutreachLog[]>();
    for (const l of logs) logsBy.set(l.exhibitorId, [...(logsBy.get(l.exhibitorId) ?? []), l]);
    const out = new Map<string, SubjectState>();
    for (const s of subjects) {
      const perm = permBy.get(s.participantId);
      const o = outBy.get(s.exhibitorId);
      const latest = [perm, o].filter(Boolean).sort((a, b) => b!.updatedAt.localeCompare(a!.updatedAt))[0];
      out.set(s.participantId, {
        view: viewOf(perm, o),
        logs: (logsBy.get(s.exhibitorId) ?? [])
          .filter((l) => l.participantId === null || l.participantId === s.participantId)
          .map(fromOutreachLog)
          .sort(byRecent),
        writable: true,
        saved: !!(perm || o),
        updatedBy: latest?.updatedBy ?? null,
        updatedAt: latest?.updatedAt ?? null,
      });
    }
    return out;
  }
  return {
    mode: "participant",
    read,
    async statuses(subjects) {
      const want = new Set(subjects.map((s) => s.participantId));
      const exhibitionIds = [...new Set(subjects.map((s) => s.exhibitionId))];
      const perms = (await Promise.all(exhibitionIds.map((id) => repo.listParticipantPermissions(id)))).flat();
      return new Map(perms.filter((p) => want.has(p.participantId)).map((p) => [p.participantId, p.status]));
    },
    async apply(subject, plan, actor) {
      const { outreach, permission } = splitPatch(plan.patch);
      if (Object.keys(permission).length && !(await repo.upsertParticipantPermission(subject.participantId, permission, actor)))
        return { ok: false, reason: "출전을 찾을 수 없어요" };
      if (Object.keys(outreach).length && !(await repo.upsertBrandOutreach(subject.exhibitorId, outreach, actor)))
        return { ok: false, reason: "브랜드를 찾을 수 없어요" };
      const log = await repo.addBrandOutreachLog(
        { ...plan.log, exhibitorId: subject.exhibitorId, participantId: subject.participantId },
        actor,
      );
      if (!log) return { ok: false, reason: "브랜드를 찾을 수 없어요" };
      const state = (await read([subject])).get(subject.participantId)!;
      return { ok: true, state, log: fromOutreachLog(log) };
    },
  };
}

// --- 옛 길: brand_contact(부스 키) -----------------------------------------------

function viewOfContact(c: BrandContact | undefined): ContactView {
  const v = emptyView();
  if (!c) return v;
  return {
    ...v,
    status: c.status,
    channel: c.channel,
    handle: c.handle,
    sentAt: c.sentAt,
    reply: c.reply,
    allowedUse: c.allowedUse,
    photoSource: c.photoSource,
    textSource: c.textSource,
    notes: c.notes,
    checklist: c.checklist,
  };
}

function fromContactLog(l: BrandContactLog, participantId: string): LogItem {
  return {
    id: l.id,
    participantId,
    direction: l.direction,
    kind: l.kind,
    channel: l.channel,
    summary: l.summary,
    actor: l.actor,
    occurredAt: l.occurredAt,
  };
}

function boothStore(repo: Repository): OutreachStore {
  async function read(subjects: ContactSubject[]) {
    const exhibitionIds = [...new Set(subjects.map((s) => s.exhibitionId))];
    const contacts = (await Promise.all(exhibitionIds.map((id) => repo.listBrandContacts({ exhibitionId: id })))).flat();
    const contactBy = new Map(contacts.map((c) => [c.boothId, c]));
    const logs = await repo.listBrandContactLogsForBooths(contacts.map((c) => c.boothId));
    const logsBy = new Map<string, BrandContactLog[]>();
    for (const l of logs) logsBy.set(l.boothId, [...(logsBy.get(l.boothId) ?? []), l]);
    const out = new Map<string, SubjectState>();
    for (const s of subjects) {
      const c = s.boothId ? contactBy.get(s.boothId) : undefined;
      out.set(s.participantId, {
        view: viewOfContact(c),
        logs: (s.boothId ? (logsBy.get(s.boothId) ?? []) : []).map((l) => fromContactLog(l, s.participantId)).sort(byRecent),
        writable: !!s.boothId,
        saved: !!c,
        updatedBy: c?.updatedBy ?? null,
        updatedAt: c?.updatedAt ?? null,
      });
    }
    return out;
  }
  return {
    mode: "booth",
    read,
    async statuses(subjects) {
      const exhibitionIds = [...new Set(subjects.map((s) => s.exhibitionId))];
      const contacts = (await Promise.all(exhibitionIds.map((id) => repo.listBrandContacts({ exhibitionId: id })))).flat();
      const byBooth = new Map(contacts.map((c) => [c.boothId, c.status]));
      const out = new Map<string, BrandContactStatus>();
      for (const s of subjects) {
        const st = s.boothId ? byBooth.get(s.boothId) : undefined;
        if (st) out.set(s.participantId, st);
      }
      return out;
    },
    async apply(subject, plan, actor) {
      if (!subject.boothId) return { ok: false, reason: READ_ONLY_REASON };
      const { doNotContact, ...patch } = plan.patch;
      if (doNotContact !== undefined) return { ok: false, reason: DNC_REASON };
      if (Object.keys(patch).length && !(await repo.upsertBrandContact(subject.boothId, patch, actor)))
        return { ok: false, reason: "부스를 찾을 수 없어요" };
      const log = await repo.addBrandContactLog(subject.boothId, plan.log, actor);
      if (!log) return { ok: false, reason: "부스를 찾을 수 없어요" };
      const state = (await read([subject])).get(subject.participantId)!;
      return { ok: true, state, log: fromContactLog(log, subject.participantId) };
    },
  };
}
