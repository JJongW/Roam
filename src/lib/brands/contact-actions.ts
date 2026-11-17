// 연락 보드의 한 번 누르기 동작 → (컨택 수정, 기록 한 줄). 순수 함수, I/O 없음.
//
// 원칙(2026-11-17 Ted: "입력칸에 직접 입력해야 하는 부분이 너무 많다"):
// - 흔한 일은 타자 없이 끝난다. 보낸 날짜는 오늘, 채널은 계정 모양에서, 누가는 관리자 쿠키에서.
// - 모든 변경은 brand_contact_log에 한 줄 남긴다. 기록 문장은 동작에서 만든다.
// - 받은 말 요지만 선택으로 적는다.
import { ALLOWED_USE_LABEL, CONTACT_CHECKLIST, CONTACT_STATUS_LABEL } from "@/lib/brands/contact";
import { isEmail, normalizeHandle } from "@/lib/brands/outreach";
import type { BrandContactLogInput, BrandContactPatch, BrandOutreachPatch, ContactAction, ParticipantPermissionPatch } from "@/lib/schemas";
import type {
  BrandContact,
  BrandContactChannel,
  BrandContactLog,
  BrandContactLogDirection,
  BrandContactLogKind,
  BrandContactStatus,
} from "@/lib/types";

export interface ActionContext {
  /** 오늘 `YYYY-MM-DD`(서울). */
  today: string;
  /** 보드가 미리 채운 계정(부스나 브랜드 공식 링크). 컨택에 계정이 없을 때만 쓴다. */
  handle?: string | null;
  /** 이 줄의 기록(처리 안 된 요청 찾기용). */
  logs?: Pick<BrandContactLog, "direction" | "kind" | "occurredAt">[];
}

/**
 * 동작이 보는 한 줄의 연락 상태. 저장 자리와 무관한 모양이다 — 목표 모양(브랜드 연락처 + 출전 허락)과
 * 옛 부스 키(brand_contact) 둘 다 이 모양으로 읽힌다(lib/brands/outreach-store.ts).
 */
export type ContactView = Pick<
  BrandContact,
  "status" | "channel" | "handle" | "sentAt" | "reply" | "allowedUse" | "photoSource" | "textSource" | "notes" | "checklist"
> & { doNotContact: boolean };

export type ContactPatch = BrandContactPatch & { doNotContact?: boolean };

export type ActionPlan =
  | { ok: true; patch: ContactPatch; log: BrandContactLogInput }
  | { ok: false; reason: string };

export function emptyView(): ContactView {
  return {
    status: "not-sent", channel: null, handle: null, sentAt: null, reply: null, allowedUse: [],
    photoSource: null, textSource: null, notes: null, checklist: {}, doNotContact: false,
  };
}

/** 수정 하나를 브랜드 쪽(연락처)과 출전 쪽(허락)으로 나눈다. */
export function splitPatch(p: ContactPatch): { outreach: BrandOutreachPatch; permission: ParticipantPermissionPatch } {
  const { handle, channel, doNotContact, ...permission } = p;
  const outreach: BrandOutreachPatch = {};
  if (handle !== undefined) outreach.handle = handle;
  if (channel !== undefined) outreach.channel = channel;
  if (doNotContact !== undefined) outreach.doNotContact = doNotContact;
  return { outreach, permission };
}

/** 보냄을 다시 누르면 안 되는 상태(이미 답이 오갔거나 결론이 남). */
const PAST_SENT: ReadonlySet<BrandContactStatus> = new Set([
  "sent", "read", "replied", "granted", "partial", "declined", "withdrawn",
]);
const ANSWERED: ReadonlySet<BrandContactStatus> = new Set(["replied", "granted", "partial", "declined", "withdrawn"]);

const STATUS_LOG: Record<BrandContactStatus, { direction: BrandContactLogDirection; kind: BrandContactLogKind }> = {
  "not-sent": { direction: "internal", kind: "other" },
  sent: { direction: "outbound", kind: "message" },
  read: { direction: "internal", kind: "other" },
  replied: { direction: "inbound", kind: "message" },
  granted: { direction: "inbound", kind: "permission" },
  partial: { direction: "inbound", kind: "permission" },
  declined: { direction: "inbound", kind: "permission" },
  "no-reply": { direction: "internal", kind: "other" },
  withdrawn: { direction: "inbound", kind: "permission" },
};

const RECEIVED_SUMMARY: Record<"message" | "permission" | "edit-request" | "takedown-request", string> = {
  message: "답장 받음",
  permission: "허락 관련 답장 받음",
  "edit-request": "수정 요청 받음",
  "takedown-request": "내려 달라는 요청 받음",
};

const REQUEST_KINDS = new Set<BrandContactLogKind>(["edit-request", "takedown-request"]);

/** 계정 모양에서 채널을 고른다. 메일이면 email, 인스타 계정이면 instagram. */
export function inferChannel(handle: string | null | undefined): BrandContactChannel | null {
  if (isEmail(handle)) return "email";
  if (normalizeHandle(handle)) return "instagram";
  return null;
}

/** 저장할 계정 표기. 인스타는 `@계정`, 메일은 그대로. */
export function canonicalHandle(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (isEmail(raw)) return raw.trim();
  const h = normalizeHandle(raw);
  return h ? `@${h}` : null;
}

function fillHandle(prev: Pick<ContactView, "handle" | "channel">, ctx: ActionContext): Pick<BrandContactPatch, "handle" | "channel"> {
  const patch: Pick<BrandContactPatch, "handle" | "channel"> = {};
  const handle = prev.handle ?? canonicalHandle(ctx.handle);
  if (!prev.handle && handle) patch.handle = handle;
  if (!prev.channel) {
    const ch = inferChannel(handle);
    if (ch) patch.channel = ch;
  }
  return patch;
}

const checkLabel = (key: string) => CONTACT_CHECKLIST.find((c) => c.key === key)?.label ?? key;

export function planContactAction(prev: ContactView, action: ContactAction, ctx: ActionContext): ActionPlan {
  const channelOf = (p: BrandContactPatch) => p.channel ?? prev.channel ?? null;
  const sending = action.type === "mark-sent" || (action.type === "set-status" && action.status === "sent");
  if (sending && prev.doNotContact) return { ok: false, reason: "연락하지 않기로 한 브랜드예요" };
  switch (action.type) {
    case "mark-sent": {
      if (PAST_SENT.has(prev.status))
        return { ok: false, reason: `이미 ${CONTACT_STATUS_LABEL[prev.status]} 상태예요` };
      const again = prev.status === "no-reply";
      const patch: BrandContactPatch = {
        status: "sent",
        // 다시 보낼 때는 날짜를 오늘로(답 없음 7일을 새로 센다). 처음이면 적힌 날짜를 지킨다.
        sentAt: again ? ctx.today : (prev.sentAt ?? ctx.today),
        ...fillHandle(prev, ctx),
        checklist: { "dm-sent": true },
      };
      return {
        ok: true,
        patch,
        log: { direction: "outbound", kind: "message", channel: channelOf(patch), summary: again ? "다시 보냄으로 표시" : "보냄으로 표시" },
      };
    }
    case "set-status": {
      const s = action.status;
      if (s === prev.status) return { ok: false, reason: "이미 그 상태예요" };
      const patch: BrandContactPatch = { status: s };
      if ((s === "sent" || s === "read") && !prev.sentAt) patch.sentAt = ctx.today;
      if (s === "sent") Object.assign(patch, fillHandle(prev, ctx), { checklist: { "dm-sent": true } });
      if (ANSWERED.has(s)) patch.checklist = { ...patch.checklist, "reply-received": true };
      const { direction, kind } = STATUS_LOG[s];
      return {
        ok: true,
        patch,
        log: {
          direction,
          kind,
          channel: channelOf(patch),
          summary: `상태 바꿈: ${CONTACT_STATUS_LABEL[prev.status]} → ${CONTACT_STATUS_LABEL[s]}`,
        },
      };
    }
    case "toggle-use": {
      const has = prev.allowedUse.includes(action.token);
      if (has === action.on) return { ok: false, reason: "이미 그렇게 돼 있어요" };
      const allowedUse = action.on ? [...prev.allowedUse, action.token] : prev.allowedUse.filter((t) => t !== action.token);
      const label = ALLOWED_USE_LABEL[action.token] ?? action.token;
      return {
        ok: true,
        patch: { allowedUse },
        log: { direction: "internal", kind: "permission", summary: `허락 범위 ${action.on ? "더함" : "뺌"}: ${label}` },
      };
    }
    case "toggle-check": {
      const done = !!prev.checklist[action.key];
      if (done === action.on) return { ok: false, reason: "이미 그렇게 돼 있어요" };
      const patch: BrandContactPatch = { checklist: { [action.key]: action.on } };
      // "보냄"을 체크했는데 아직 안 보냄이면 상태와 날짜도 같이(예전 시트와 같은 규칙).
      if (action.key === "dm-sent" && action.on && prev.status === "not-sent")
        Object.assign(patch, { status: "sent", sentAt: prev.sentAt ?? ctx.today }, fillHandle(prev, ctx));
      return {
        ok: true,
        patch,
        log: { direction: "internal", kind: "other", summary: `${action.on ? "체크" : "체크 풂"}: ${checkLabel(action.key)}` },
      };
    }
    case "confirm-handle": {
      const handle = canonicalHandle(action.handle);
      if (!handle) return { ok: false, reason: "인스타 계정이나 메일 모양이 아니에요" };
      if (handle === prev.handle) return { ok: false, reason: "이미 그 계정이에요" };
      const channel = inferChannel(handle);
      return {
        ok: true,
        patch: { handle, ...(channel ? { channel } : {}) },
        log: { direction: "internal", kind: "other", channel, summary: `계정 확정: ${handle}` },
      };
    }
    case "received": {
      const note = action.note ?? null;
      const patch: BrandContactPatch = {};
      if (action.kind === "message" || action.kind === "permission") {
        if (!ANSWERED.has(prev.status)) patch.status = "replied";
        patch.checklist = { "reply-received": true };
        if (note) patch.reply = note;
      }
      return {
        ok: true,
        patch,
        log: {
          direction: "inbound",
          kind: action.kind,
          channel: prev.channel,
          summary: note ? `${RECEIVED_SUMMARY[action.kind]}: ${note}` : RECEIVED_SUMMARY[action.kind],
        },
      };
    }
    case "set-do-not-contact":
      if (prev.doNotContact === action.on) return { ok: false, reason: "이미 그렇게 돼 있어요" };
      return {
        ok: true,
        patch: { doNotContact: action.on },
        log: { direction: "internal", kind: "other", summary: action.on ? "연락하지 않기로 함(모든 박람회)" : "연락 금지 풂" },
      };
    case "thanks-sent":
      return {
        ok: true,
        patch: { checklist: { "thanks-sent": true } },
        log: { direction: "outbound", kind: "thanks", channel: prev.channel, summary: "감사 답장 보냄" },
      };
    case "resolve-request": {
      const open = openRequest(ctx.logs ?? []);
      if (!open) return { ok: false, reason: "처리할 요청이 없어요" };
      return {
        ok: true,
        patch: {},
        log: {
          direction: "internal",
          kind: open.kind,
          summary: open.kind === "takedown-request" ? "내려 달라는 요청 처리함" : "수정 요청 처리함",
        },
      };
    }
    case "set-sent-date":
      if (action.sentAt === prev.sentAt) return { ok: false, reason: "이미 그 날짜예요" };
      return {
        ok: true,
        patch: { sentAt: action.sentAt },
        log: { direction: "internal", kind: "other", summary: `보낸 날짜 고침: ${action.sentAt}` },
      };
    case "note":
      return { ok: true, patch: {}, log: { direction: "internal", kind: "other", summary: action.text } };
    case "set-sources": {
      const patch: BrandContactPatch = {};
      const parts: string[] = [];
      if (action.photoSource !== undefined && action.photoSource !== prev.photoSource) {
        patch.photoSource = action.photoSource;
        parts.push(action.photoSource ? "사진 위치 적음" : "사진 위치 지움");
      }
      if (action.textSource !== undefined && action.textSource !== prev.textSource) {
        patch.textSource = action.textSource;
        parts.push(action.textSource ? "글 위치 적음" : "글 위치 지움");
      }
      if (parts.length === 0) return { ok: false, reason: "바뀐 게 없어요" };
      return { ok: true, patch, log: { direction: "internal", kind: "other", summary: parts.join(", ") } };
    }
  }
}

/** 받은 수정, 내려 달라는 요청 중 아직 "처리함" 기록이 없는 가장 최근 것. */
export function openRequest(
  logs: Pick<BrandContactLog, "direction" | "kind" | "occurredAt">[],
): { kind: "edit-request" | "takedown-request"; occurredAt: string } | null {
  const sorted = [...logs].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  const req = sorted.find((l) => l.direction === "inbound" && REQUEST_KINDS.has(l.kind));
  if (!req) return null;
  const handled = sorted.some(
    (l) => l.direction === "internal" && REQUEST_KINDS.has(l.kind) && l.occurredAt >= req.occurredAt,
  );
  return handled ? null : { kind: req.kind as "edit-request" | "takedown-request", occurredAt: req.occurredAt };
}
