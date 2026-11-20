/**
 * 브랜드 고치기 `brand-fix.v1` — 인입(brands.v1)이 못 하는 운영 수정을 사람이 손으로 돌릴 때 쓴다.
 * 순수. DB도 네트워크도 안 탄다(읽기와 쓰기는 scripts/brand-fix.ts).
 *
 * brands.v1은 빈 칸만 채우고 기존 브랜드의 이름, 참가 사실, 분류를 바꾸지 않는다(brands-plan.ts).
 * 주최 측 사이트가 바뀌었을 때 이미 들어간 값을 고치는 일은 여기서 한다:
 *  - removeParticipation  그 행사 참가 사실 하나를 지운다(브랜드는 지우지 않는다).
 *  - rename               브랜드 이름과 그 행사 표기 이름을 바꾸고 옛 이름은 별칭으로 남긴다.
 *  - setCategory          그 행사 참가 사실의 분류(metadata.category).
 *  - setIntro, setPhotos  브랜드 칸 intro, photos를 덮는다. 사람이 확인한 칸(reviewed, artist_confirmed)은 건드리지 않는다.
 *
 * 모든 작업은 "지금 값이 파일이 기대한 옛 값일 때만" 쓴다. 이미 새 값이면 same, 둘 다 아니면 conflict.
 * 결정 기록: docs/decisions/2026-11-20_새해준비상점-사이트-변경-운영-반영.md
 */
import { z } from "zod";
import type { ProfileField } from "@/lib/types";

export const BRAND_FIX_VERSION = "brand-fix.v1";

const name = z.string().trim().min(1).max(120);
const exhibitorId = z.string().trim().min(1).max(120);
const photo = z.object({ path: z.string().trim().min(1).max(1000), scope: z.string().trim().min(1).max(200) }).strict();

const opSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("removeParticipation"), key: z.string().min(1), exhibitorId, name, why: z.string().min(1).max(500) }).strict(),
  z.object({ op: z.literal("rename"), key: z.string().min(1), exhibitorId, from: name, to: name }).strict(),
  z.object({ op: z.literal("setCategory"), key: z.string().min(1), exhibitorId, from: z.string().min(1).max(60), to: z.string().min(1).max(60) }).strict(),
  z
    .object({
      op: z.literal("setIntro"),
      key: z.string().min(1),
      exhibitorId,
      /** 지금 운영에 있을 것으로 기대하는 원문. */
      from: z.string().min(1).max(4000),
      /** 브랜드가 쓴 원문 그대로. */
      to: z.string().trim().min(1).max(4000),
      source: z.string().min(1).max(1000),
    })
    .strict(),
  z
    .object({
      op: z.literal("setPhotos"),
      key: z.string().min(1),
      exhibitorId,
      /** 지금 운영에 있을 것으로 기대하는 사진(빈 칸이면 []). */
      from: z.array(photo).max(20),
      to: z.array(photo).min(1).max(20),
      source: z.string().min(1).max(1000),
    })
    .strict(),
]);
export type BrandFixOp = z.infer<typeof opSchema>;

export const brandFixFileSchema = z
  .object({
    version: z.literal(BRAND_FIX_VERSION),
    exhibitionSlug: z.string().min(1),
    note: z.string().max(1000).optional(),
    ops: z.array(opSchema).min(1),
  })
  .strict();
export type BrandFixFile = z.infer<typeof brandFixFileSchema>;

export interface FixParticipant {
  id: string;
  exhibitorId: string;
  displayName: string;
  aliases: string[];
  metadata: Record<string, unknown>;
}

/** 참가 사실을 지울 때 같이 사라지거나(cascade) 막는(restrict) 행 수. */
export interface ParticipantDependents {
  /** participant_permission — restrict라 있으면 지우지 못한다. */
  permissions: number;
  /** booth_participant — cascade. */
  boothAssignments: number;
  /** exhibitor_link_candidate.participant_id — cascade. */
  linkCandidates: number;
  /** brand_profile_field의 출전 칸 — cascade. */
  participantFields: number;
  /** brand_outreach_log.participant_id — set null(기록은 브랜드에 남는다). */
  outreachLogs: number;
}

export interface BrandFixState {
  exhibitionId: string;
  exhibitors: Map<string, { canonicalName: string; aliases: string[] }>;
  /** 이 행사 참가 사실, exhibitorId로. */
  participants: Map<string, FixParticipant>;
  /** 브랜드의 다른 행사 참가 수. */
  otherParticipations: Map<string, number>;
  dependents: Map<string, ParticipantDependents>;
  fields: ProfileField[];
}

export type FixAction = "write" | "same" | "conflict" | "blocked";

export interface FixChange {
  what: string;
  from: unknown;
  to: unknown;
}

export interface PlannedFix {
  op: BrandFixOp;
  action: FixAction;
  /** 사람이 읽을 한 줄. */
  message: string;
  changes: FixChange[];
  /** 쓰기에 쓸 값. action이 write일 때만. */
  write?:
    | { kind: "deleteParticipant"; participantId: string }
    | {
        kind: "rename";
        exhibitor: { canonicalName: string; aliases: string[] };
        participant?: { id: string; displayName: string; aliases: string[] };
      }
    | { kind: "participantMetadata"; participantId: string; metadata: Record<string, unknown> }
    | {
        kind: "field";
        field: "intro" | "photos";
        value: unknown;
        sources: string[];
        expected: Pick<ProfileField, "status" | "updatedAt"> | null;
      };
}

/** 사람이 확인한 칸. 이 작업으로는 절대 덮지 않는다. */
export const PROTECTED_STATUSES = new Set(["reviewed", "artist_confirmed"]);

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
/** 별칭을 이름 하나 바꾼 뒤의 모양으로: 새 이름은 빼고 옛 이름은 더한다. */
function renamedAliases(aliases: string[], from: string, to: string): string[] {
  const out = aliases.filter((a) => a !== to);
  if (!out.includes(from)) out.push(from);
  return out;
}

export function planBrandFix(file: BrandFixFile, state: BrandFixState): PlannedFix[] {
  return file.ops.map((op): PlannedFix => {
    const ex = state.exhibitors.get(op.exhibitorId);
    const p = state.participants.get(op.exhibitorId);
    const base = { op, changes: [] as FixChange[] };
    if (!ex) return { ...base, action: "conflict", message: `브랜드 ${op.exhibitorId}가 운영에 없어요` };

    switch (op.op) {
      case "removeParticipation": {
        if (!p) return { ...base, action: "same", message: `${file.exhibitionSlug} 참가 사실이 이미 없어요` };
        const d = state.dependents.get(p.id) ?? { permissions: 0, boothAssignments: 0, linkCandidates: 0, participantFields: 0, outreachLogs: 0 };
        if (ex.canonicalName !== op.name && p.displayName !== op.name)
          return { ...base, action: "conflict", message: `이름이 파일(${op.name})과 달라요: 브랜드 ${ex.canonicalName}, 표기 ${p.displayName}` };
        if (d.permissions > 0)
          return { ...base, action: "blocked", message: `허락 기록 ${d.permissions}건이 있어 지우지 않아요(먼저 사람이 옮기거나 지워야 해요)` };
        const others = state.otherParticipations.get(op.exhibitorId) ?? 0;
        const brandFields = state.fields.filter((f) => f.exhibitorId === op.exhibitorId).length;
        return {
          ...base,
          action: "write",
          message:
            `참가 사실 ${p.id}(${p.displayName}) 지움. 같이 지워짐: 부스 배정 ${d.boothAssignments}, 연결 후보 ${d.linkCandidates}, 출전 칸 ${d.participantFields}. ` +
            `연락 기록 ${d.outreachLogs}건은 브랜드에 남음. 브랜드 ${op.exhibitorId}는 둠(다른 행사 ${others}, 브랜드 칸 ${brandFields})`,
          changes: [{ what: "exhibition_participant", from: p.id, to: null }],
          write: { kind: "deleteParticipant", participantId: p.id },
        };
      }
      case "rename": {
        const canonOk = ex.canonicalName === op.to;
        const partOk = !p || p.displayName === op.to;
        if (canonOk && partOk) return { ...base, action: "same", message: `이미 ${op.to}예요` };
        if (ex.canonicalName !== op.from && ex.canonicalName !== op.to)
          return { ...base, action: "conflict", message: `브랜드 이름이 ${ex.canonicalName}예요(파일은 ${op.from} → ${op.to})` };
        if (p && p.displayName !== op.from && p.displayName !== op.to)
          return { ...base, action: "conflict", message: `표기 이름이 ${p.displayName}예요(파일은 ${op.from} → ${op.to})` };
        const exAliases = renamedAliases(ex.aliases, op.from, op.to);
        const changes: FixChange[] = [
          { what: "exhibitor.canonical_name", from: ex.canonicalName, to: op.to },
          { what: "exhibitor.aliases", from: ex.aliases, to: exAliases },
        ];
        let participant: { id: string; displayName: string; aliases: string[] } | undefined;
        if (p) {
          participant = { id: p.id, displayName: op.to, aliases: renamedAliases(p.aliases, op.from, op.to) };
          changes.push(
            { what: "exhibition_participant.display_name", from: p.displayName, to: op.to },
            { what: "exhibition_participant.aliases", from: p.aliases, to: participant.aliases },
          );
        }
        return {
          ...base,
          action: "write",
          message: `${op.from} → ${op.to}`,
          changes,
          write: { kind: "rename", exhibitor: { canonicalName: op.to, aliases: exAliases }, participant },
        };
      }
      case "setCategory": {
        if (!p) return { ...base, action: "conflict", message: `${file.exhibitionSlug} 참가 사실이 없어요` };
        const cur = p.metadata.category;
        if (cur === op.to) return { ...base, action: "same", message: `이미 ${op.to}예요` };
        if (cur !== op.from) return { ...base, action: "conflict", message: `분류가 ${String(cur)}예요(파일은 ${op.from} → ${op.to})` };
        return {
          ...base,
          action: "write",
          message: `${op.from} → ${op.to}`,
          changes: [{ what: "exhibition_participant.metadata.category", from: cur, to: op.to }],
          write: { kind: "participantMetadata", participantId: p.id, metadata: { ...p.metadata, category: op.to } },
        };
      }
      case "setIntro":
      case "setPhotos": {
        const field = op.op === "setIntro" ? "intro" : "photos";
        const cur = state.fields.find((f) => f.exhibitorId === op.exhibitorId && f.field === field);
        if (cur && PROTECTED_STATUSES.has(cur.status))
          return { ...base, action: "blocked", message: `${field} 칸이 ${cur.status}라 덮지 않아요(사람이 확인한 칸)` };
        const expected = cur ? { status: cur.status, updatedAt: cur.updatedAt } : null;
        if (op.op === "setIntro") {
          const curText = cur ? (cur.value as { original?: string } | null)?.original : undefined;
          if (curText === op.to && cur?.status === "collected") return { ...base, action: "same", message: "이미 새 원문이에요" };
          if (curText !== undefined && curText !== op.from && curText !== op.to)
            return { ...base, action: "conflict", message: "운영 원문이 파일이 기대한 옛 원문과 달라요" };
          return {
            ...base,
            action: "write",
            message: `소개 원문 덮음(${cur?.status ?? "빈 칸"} → collected, 말투 변환본은 워커가 다시 만듦)`,
            changes: [
              { what: "intro.original", from: curText ?? null, to: op.to },
              { what: "intro.status", from: cur?.status ?? null, to: "collected" },
            ],
            write: { kind: "field", field: "intro", value: { original: op.to }, sources: [op.source], expected },
          };
        }
        const curPhotos = (cur?.value as { path: string; scope: string }[] | undefined) ?? [];
        if (same(curPhotos, op.to)) return { ...base, action: "same", message: "이미 새 사진이에요" };
        if (!same(curPhotos, op.from))
          return { ...base, action: "conflict", message: "운영 사진이 파일이 기대한 옛 사진과 달라요" };
        return {
          ...base,
          action: "write",
          message: `사진 ${curPhotos.length}장 → ${op.to.length}장`,
          changes: [{ what: "photos", from: curPhotos.map((x) => x.path), to: op.to.map((x) => x.path) }],
          write: { kind: "field", field: "photos", value: op.to, sources: [op.source], expected },
        };
      }
    }
  });
}

export function summarizeFix(plans: PlannedFix[]): Record<FixAction, number> {
  const s: Record<FixAction, number> = { write: 0, same: 0, conflict: 0, blocked: 0 };
  for (const p of plans) s[p.action]++;
  return s;
}
