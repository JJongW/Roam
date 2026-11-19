// /admin/brands/contacts "브랜드 연락 현황" — 순수 계산. I/O 없음.
//
// 한 줄 = 그 박람회의 출전(exhibition_participant) 하나. 부스는 있으면 붙는 선택 칸이다
// (2026-11-17 Ted: "브랜드가 우선, 부스는 그 이후"). 열쇠는 둘:
//   - 연락처와 VOC는 브랜드(exhibitorId)
//   - 회차별 허락(상태, 허락 범위, 체크리스트)은 출전(participantId)
// 저장 자리는 lib/brands/outreach-store.ts가 가린다. 목표 모양(정규화 초안 STEP 1)이 운영에 없으면
// 옛 brand_contact(부스 키)로 돌아가고, 그때 부스 없는 줄은 저장만 막힌다(`writable: false`).
import { CONTACT_STATUS_LABEL } from "@/lib/brands/contact";
import { isEmail, normalizeHandle } from "@/lib/brands/outreach";
import { openRequest } from "@/lib/brands/contact-actions";
import type { ContactView } from "@/lib/brands/contact-actions";
import type { BrandContactLog, BrandContactStatus } from "@/lib/types";

/** 줄의 열쇠. 출전이 주인이고, 브랜드는 연락처의 주인, 부스는 있으면 붙는다. */
export interface ContactRef {
  participantId: string;
  exhibitorId: string;
  boothId: string | null;
}

/**
 * 인스타 계정이 어디서 왔고 얼마나 믿을 만한지.
 * - official: 부스나 브랜드의 공식 링크(주최 측 명단, 부스 정보)
 * - confirmed: 사람이 확정한 계정(연락에 쓴 계정, csv "확실")
 * - high: csv "높음"
 * - candidate: csv "후보" — 보내기 전에 프로필을 꼭 본다
 */
export const HANDLE_CONFIDENCES = ["official", "confirmed", "high", "candidate"] as const;
export type HandleConfidence = (typeof HANDLE_CONFIDENCES)[number];
export const HANDLE_CONFIDENCE_LABEL: Record<HandleConfidence, string> = {
  official: "공식 정보",
  confirmed: "확실",
  high: "높음",
  candidate: "후보",
};

/** 프로필 칸 출처에 남기는 신뢰도 표시(`handle-confidence:high`). 스키마에 칸이 없어 출처 목록에 둔다. */
export const CONFIDENCE_SOURCE_PREFIX = "handle-confidence:";

export const STATUS_ORDER: BrandContactStatus[] = [
  "not-sent", "sent", "read", "replied", "granted", "partial", "declined", "no-reply", "withdrawn",
];

/** 보낸 뒤 이 날수를 넘기면 "답 없음 7일"로 올린다. */
export const OVERDUE_DAYS = 7;

export type ActionFlag = "overdue" | "reply-unprocessed" | "request-open";
export const ACTION_FLAG_LABEL: Record<ActionFlag, string> = {
  overdue: `보낸 지 ${OVERDUE_DAYS}일 넘게 답 없음`,
  "reply-unprocessed": "답장 왔는데 아직 처리 전",
  "request-open": "수정이나 내려 달라는 요청",
};

export interface BoardRow {
  key: string;
  ref: ContactRef;
  /** 지금 저장할 수 있나. 목표 모양이면 늘 true, 옛 부스 키로 돌아가 있으면 부스가 있어야 한다. */
  writable: boolean;
  /** 이 브랜드는 더 연락하지 않는다(모든 박람회). */
  doNotContact: boolean;
  exhibitorId: string | null;
  name: string;
  code: string | null;
  handle: string | null;
  handleConfidence: HandleConfidence | null;
  /** 메일로 연락하는 곳. 연락 기록의 handle이 메일이면 여기로 간다. */
  email: string | null;
  status: BrandContactStatus;
  sentAt: string | null;
  daysSinceSent: number | null;
  lastLog: Pick<BrandContactLog, "summary" | "kind" | "direction" | "occurredAt"> | null;
  /** 할 일 판단에 쓰는 기록 요약(문장 없이). 화면에서 동작 뒤 다시 계산할 때 쓴다. */
  logMeta: Pick<BrandContactLog, "direction" | "kind" | "occurredAt">[];
  allowedUse: string[];
  items: string[];
  flags: ActionFlag[];
}

export type LogLite = Pick<BrandContactLog, "direction" | "kind" | "summary" | "occurredAt">;

export interface BoardSource {
  ref: ContactRef;
  name: string;
  code?: string | null;
  view: ContactView | null;
  writable: boolean;
  logs: LogLite[];
  /** 가능한 계정 후보, 앞일수록 우선. */
  handles: { value: string | null | undefined; confidence: HandleConfidence }[];
  items?: string[];
}

/** YYYY-MM-DD 두 날짜 사이 날수. */
export function daysBetween(fromDate: string, today: string): number {
  const a = Date.parse(`${fromDate}T00:00:00Z`);
  const b = Date.parse(`${today}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

/**
 * 오늘 손댈 것.
 * - overdue: 보냄이나 읽음 상태로 보낸 지 7일을 넘김
 * - reply-unprocessed: 상태가 "답장"(허락 여부 미정)이거나, 보냄, 읽음, 답 없음인데 마지막 기록이 받은 연락
 * - request-open: 받은 수정이나 내려 달라는 요청 뒤에 "처리함" 내부 기록이 없음
 */
export function actionFlags(
  c: Pick<ContactView, "status" | "sentAt"> | null,
  logs: Pick<BrandContactLog, "direction" | "kind" | "occurredAt">[],
  today: string,
): ActionFlag[] {
  const out: ActionFlag[] = [];
  const status = c?.status ?? "not-sent";
  if ((status === "sent" || status === "read") && c?.sentAt && daysBetween(c.sentAt, today) > OVERDUE_DAYS)
    out.push("overdue");
  const sorted = [...logs].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  const last = sorted[0];
  if (
    status === "replied" ||
    ((status === "sent" || status === "read" || status === "no-reply") && last?.direction === "inbound")
  )
    out.push("reply-unprocessed");
  if (openRequest(logs)) out.push("request-open");
  return out;
}

/**
 * 인스타 계정 후보 순서. 브랜드가 먼저고 부스는 나중이다(2026-11-17 Ted "브랜드가 우선, 부스는 그 이후").
 * 브랜드 프로필 links 칸 → 브랜드 공식 링크(exhibitor.instagram_url) → 대표 부스 링크.
 * 연락에 실제로 쓴 계정(view.handle)은 이보다도 앞이다(buildRow).
 */
export function handleCandidates(src: {
  profile: { url: string; confidence: HandleConfidence } | null;
  brandOfficial: string | null | undefined;
  booth: string | null | undefined;
}): BoardSource["handles"] {
  return [
    ...(src.profile ? [{ value: src.profile.url, confidence: src.profile.confidence }] : []),
    { value: src.brandOfficial, confidence: "official" as const },
    { value: src.booth, confidence: "official" as const },
  ];
}

export function buildRow(s: BoardSource, today: string): BoardRow {
  const c = s.view;
  const contactHandle = c?.handle ?? null;
  let handle: string | null = null;
  let handleConfidence: HandleConfidence | null = null;
  const candidates = [
    { value: contactHandle, confidence: "confirmed" as HandleConfidence },
    ...s.handles,
  ];
  for (const h of candidates) {
    const n = normalizeHandle(h.value);
    if (n) {
      handle = n;
      handleConfidence = h.confidence;
      break;
    }
  }
  const latest = [...s.logs].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))[0];
  return {
    key: s.ref.participantId,
    ref: s.ref,
    writable: s.writable,
    doNotContact: c?.doNotContact ?? false,
    exhibitorId: s.ref.exhibitorId,
    name: s.name,
    code: s.code ?? null,
    handle,
    handleConfidence,
    email: isEmail(contactHandle) ? contactHandle!.trim() : null,
    status: c?.status ?? "not-sent",
    sentAt: c?.sentAt ?? null,
    daysSinceSent: c?.sentAt ? daysBetween(c.sentAt, today) : null,
    lastLog: latest
      ? { summary: latest.summary, kind: latest.kind, direction: latest.direction, occurredAt: latest.occurredAt }
      : null,
    logMeta: s.logs.map((l) => ({ direction: l.direction, kind: l.kind, occurredAt: l.occurredAt })),
    allowedUse: c?.allowedUse ?? [],
    items: s.items ?? [],
    flags: actionFlags(c, s.logs, today),
  };
}

/** 저장 결과(컨택, 새 기록 한 줄)를 줄에 반영한다 — 2천 줄을 다시 읽지 않으려고. */
export function applyContactResult(row: BoardRow, contact: ContactView, log: LogLite | null, today: string): BoardRow {
  const logMeta = log
    ? [...row.logMeta, { direction: log.direction, kind: log.kind, occurredAt: log.occurredAt }]
    : row.logMeta;
  const lastLog =
    log && (!row.lastLog || log.occurredAt >= row.lastLog.occurredAt)
      ? { summary: log.summary, kind: log.kind, direction: log.direction, occurredAt: log.occurredAt }
      : row.lastLog;
  const h = normalizeHandle(contact.handle);
  return {
    ...row,
    handle: h ?? row.handle,
    handleConfidence: h ? "confirmed" : row.handleConfidence,
    email: isEmail(contact.handle) ? contact.handle!.trim() : row.email,
    doNotContact: contact.doNotContact,
    status: contact.status,
    sentAt: contact.sentAt,
    daysSinceSent: contact.sentAt ? daysBetween(contact.sentAt, today) : null,
    lastLog,
    logMeta,
    allowedUse: contact.allowedUse,
    flags: actionFlags(contact, logMeta, today),
  };
}

export interface Funnel {
  total: number;
  byStatus: Record<BrandContactStatus, number>;
  flags: Record<ActionFlag, number>;
  /** 할 일 표시가 하나라도 붙은 브랜드 수. 한 브랜드가 표시를 여럿 가질 수 있어 flags 합과 다르다.
   *  관리자 홈의 "브랜드 연락 할 일" 숫자가 이것이다. */
  todo: number;
  noHandle: number;
  readOnly: number;
}

export function funnel(rows: BoardRow[]): Funnel {
  const byStatus = Object.fromEntries(STATUS_ORDER.map((s) => [s, 0])) as Record<BrandContactStatus, number>;
  const flags: Record<ActionFlag, number> = { overdue: 0, "reply-unprocessed": 0, "request-open": 0 };
  let noHandle = 0;
  let readOnly = 0;
  let todo = 0;
  for (const r of rows) {
    byStatus[r.status]++;
    if (r.flags.length > 0) todo++;
    for (const f of r.flags) flags[f]++;
    if (!r.handle && !r.email) noHandle++;
    if (!r.writable) readOnly++;
  }
  return { total: rows.length, byStatus, flags, todo, noHandle, readOnly };
}

export interface BoardFilter {
  q?: string;
  statuses?: BrandContactStatus[];
  hasHandle?: boolean;
  confidence?: HandleConfidence | "none";
  flag?: ActionFlag;
}

export function filterRows(rows: BoardRow[], f: BoardFilter): BoardRow[] {
  const q = f.q?.trim().toLowerCase();
  return rows.filter((r) => {
    if (f.statuses?.length && !f.statuses.includes(r.status)) return false;
    if (f.hasHandle !== undefined && !!(r.handle || r.email) !== f.hasHandle) return false;
    if (f.confidence === "none" ? r.handleConfidence !== null : f.confidence && r.handleConfidence !== f.confidence)
      return false;
    if (f.flag && !r.flags.includes(f.flag)) return false;
    if (q && ![r.name, r.code ?? "", r.handle ?? ""].some((s) => s.toLowerCase().includes(q))) return false;
    return true;
  });
}

export type SortKey = "name" | "code" | "status" | "days" | "recent";
export const SORT_LABEL: Record<SortKey, string> = {
  name: "이름순",
  code: "부스 번호순",
  status: "상태순",
  days: "보낸 지 오래된 순",
  recent: "최근 기록순",
};

export function sortRows(rows: BoardRow[], key: SortKey): BoardRow[] {
  const byName = (a: BoardRow, b: BoardRow) => a.name.localeCompare(b.name, "ko");
  const cmp: Record<SortKey, (a: BoardRow, b: BoardRow) => number> = {
    name: byName,
    // 부스 없는 줄은 뒤로.
    code: (a, b) =>
      (a.code ? 0 : 1) - (b.code ? 0 : 1) ||
      (a.code ?? "").localeCompare(b.code ?? "", "ko", { numeric: true }) ||
      byName(a, b),
    status: (a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) || byName(a, b),
    days: (a, b) => (b.daysSinceSent ?? -1) - (a.daysSinceSent ?? -1) || byName(a, b),
    recent: (a, b) => (b.lastLog?.occurredAt ?? "").localeCompare(a.lastLog?.occurredAt ?? "") || byName(a, b),
  };
  return [...rows].sort(cmp[key]);
}

export const statusLabel = (s: BrandContactStatus) => CONTACT_STATUS_LABEL[s];
