// 브랜드 컨택(0061)의 표시 이름과 순수 계산. I/O 없음.
//
// 상태값은 Roam-design의 문구전 겨울 허락 추적표(permissions.csv)의 dmStatus와 같다 —
// 나중에 그 csv를 그대로 가져올 수 있게. `replied`(답은 왔는데 허락 여부는 아직)만
// 이쪽에서 더했다.
import type {
  BrandContact,
  BrandContactChannel,
  BrandContactLogDirection,
  BrandContactLogKind,
  BrandContactStatus,
} from "@/lib/types";
import type { BrandContactPatch } from "@/lib/schemas";

export const CONTACT_STATUS_LABEL: Record<BrandContactStatus, string> = {
  "not-sent": "미연락",
  sent: "DM 보냄",
  read: "읽음",
  replied: "답장 받음",
  granted: "허락",
  partial: "일부 허락",
  declined: "거절",
  "no-reply": "응답 없음",
  withdrawn: "허락 철회",
};

export const CONTACT_CHANNEL_LABEL: Record<BrandContactChannel, string> = {
  instagram: "인스타그램",
  x: "X",
  email: "이메일",
  other: "기타",
};

export const LOG_DIRECTION_LABEL: Record<BrandContactLogDirection, string> = {
  outbound: "보냄",
  inbound: "받음",
  internal: "내부 메모",
};

export const LOG_KIND_LABEL: Record<BrandContactLogKind, string> = {
  message: "연락",
  permission: "허락 관련",
  "edit-request": "수정 요청",
  "takedown-request": "내려 달라는 요청",
  thanks: "감사 답장",
  other: "기타",
};

/**
 * 체크리스트 항목. 저장은 `{ key: 완료 시각 }` jsonb라 항목을 늘려도 마이그레이션이
 * 필요 없다 — 여기 한 줄만 더한다. key는 바꾸지 않는다(이미 저장된 완료 기록이 끊긴다).
 */
export const CONTACT_CHECKLIST = [
  { key: "dm-sent", label: "DM 보냄" },
  { key: "reply-received", label: "연락 받음" },
  { key: "image-received", label: "이미지 받음" },
  { key: "image-uploaded", label: "이미지 업로드 완료" },
  { key: "text-received", label: "글 내용 받음" },
  { key: "text-uploaded", label: "글 내용 업로드 완료" },
  { key: "preview-shared", label: "게시 전 공유" },
  { key: "thanks-sent", label: "감사 답장 완료" },
] as const;
export type ContactChecklistKey = (typeof CONTACT_CHECKLIST)[number]["key"];
export const CONTACT_CHECKLIST_KEYS = CONTACT_CHECKLIST.map((c) => c.key) as [
  ContactChecklistKey,
  ...ContactChecklistKey[],
];

/** 허락 범위 토큰. csv allowedUse 표기법 그대로 + `text`(글 사용). 모르는 토큰도 저장은 된다. */
export const ALLOWED_USE_LABEL: Record<string, string> = {
  "account-photo": "계정 사진 사용",
  "sent-photo": "보내 준 사진만",
  text: "글 사용",
  tag: "계정 표기",
  price: "가격 공개",
  "no-price": "가격 비공개",
  preview: "게시 전 확인 원함",
};

/** 진행 현황 요약에서 "보냄"으로 셀 상태(연락을 한 번이라도 한 것). */
const SENT: ReadonlySet<BrandContactStatus> = new Set([
  "sent", "read", "replied", "granted", "partial", "declined", "no-reply", "withdrawn",
]);
/** "답장"으로 셀 상태(상대가 답한 것). */
const REPLIED: ReadonlySet<BrandContactStatus> = new Set([
  "replied", "granted", "partial", "declined", "withdrawn",
]);
/** "허락"으로 셀 상태(지금 쓸 수 있는 것). 철회는 뺀다. */
const GRANTED: ReadonlySet<BrandContactStatus> = new Set(["granted", "partial"]);

export interface ContactProgress {
  total: number;
  sent: number;
  replied: number;
  granted: number;
  byStatus: Record<BrandContactStatus, number>;
}

/**
 * 진행 현황. `total`은 대상 부스 수다 — 컨택 행이 없는 부스는 미연락으로 센다
 * (행이 없다 = 아직 아무것도 안 함. 행이 있어야만 센다면 연락 안 한 곳이 0으로 숨는다).
 */
export function summarizeContacts(
  boothIds: string[],
  contacts: ReadonlyMap<string, Pick<BrandContact, "status">>,
): ContactProgress {
  const byStatus = Object.fromEntries(
    Object.keys(CONTACT_STATUS_LABEL).map((k) => [k, 0]),
  ) as Record<BrandContactStatus, number>;
  let sent = 0;
  let replied = 0;
  let granted = 0;
  for (const id of boothIds) {
    const status = contacts.get(id)?.status ?? "not-sent";
    byStatus[status]++;
    if (SENT.has(status)) sent++;
    if (REPLIED.has(status)) replied++;
    if (GRANTED.has(status)) granted++;
  }
  return { total: boothIds.length, sent, replied, granted, byStatus };
}

/**
 * 체크리스트 토글을 기존 기록에 합친다. 이미 완료된 항목을 다시 켜도 처음 완료 시각을
 * 지키고(언제 처음 했는지가 기록의 의미다), 끄면 지운다. 토글에 없는 key는 그대로 둔다.
 */
export function applyChecklist(
  prev: Record<string, string>,
  toggles: Partial<Record<string, boolean>>,
  at: string,
): Record<string, string> {
  const next = { ...prev };
  for (const [key, on] of Object.entries(toggles)) {
    if (on === undefined) continue;
    if (on) next[key] = prev[key] ?? at;
    else delete next[key];
  }
  return next;
}

/** csv allowedUse(`account-photo; tag; reuse-05`) → 토큰 배열. 가져오기용. */
export function parseAllowedUse(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return [...new Set(raw.split(";").map((t) => t.trim()).filter(Boolean))];
}

/**
 * 부분 수정 합치기 — mock과 Supabase가 같은 규칙을 쓰게 한 곳에 둔다.
 * 보낸 키만 바꾸고(`undefined` = 그대로), 체크리스트는 applyChecklist로 합친다.
 */
export function mergeContactPatch(
  prev: BrandContact,
  patch: BrandContactPatch,
  actor: string | null,
  at: string,
): BrandContact {
  const { checklist, ...fields } = patch;
  const next: BrandContact = { ...prev, updatedBy: actor, updatedAt: at };
  for (const [k, v] of Object.entries(fields)) {
    if (v !== undefined) (next as unknown as Record<string, unknown>)[k] = v;
  }
  if (checklist) next.checklist = applyChecklist(prev.checklist, checklist, at);
  return next;
}

/** 컨택 행이 없을 때 화면과 저장소가 쓰는 빈 값. */
export function emptyContact(boothId: string, exhibitionId: string, at: string): BrandContact {
  return {
    boothId,
    exhibitionId,
    status: "not-sent",
    channel: null,
    handle: null,
    sentAt: null,
    reply: null,
    allowedUse: [],
    photoSource: null,
    textSource: null,
    notes: null,
    checklist: {},
    updatedBy: null,
    createdAt: at,
    updatedAt: at,
  };
}
