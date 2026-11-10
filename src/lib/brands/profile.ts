// 브랜드 프로필 칸 정의 — 기준 문서 Roam-design `docs/content/engine/brand-profile-spec.md`.
// 순수 모듈. 칸을 늘리면 여기 한 줄을 더한다(저장은 칸별 행이라 마이그레이션이 없다).
//
// 이름, 출전 이력, 방문객 반응, 연락은 여기 없다. 이름은 exhibitor.canonical_name,
// 이력과 반응은 계산값, 연락은 brand_contact다.
import { z } from "zod";
import type { ProfileField, ProfileFieldStatus, ProfileSubject } from "@/lib/types";

export const FIELD_STATUS_LABEL: Record<ProfileFieldStatus, string> = {
  collected: "공식 자료",
  ai_draft: "AI 초안",
  reviewed: "에디터 확인",
  artist_confirmed: "작가 확인",
  stale: "다시 볼 것",
};

/** 9장 시작 목록. 박람회를 거치며 늘린다. 자유어를 받으면 묶이지 않는다. */
export const ITEM_OPTIONS = [
  "스티커",
  "씰스티커",
  "엽서",
  "포스터",
  "키링",
  "아크릴",
  "떡메모지",
  "마스킹테이프",
  "다이어리와 속지",
  "책갈피",
  "뜨개",
  "비즈",
  "레진",
  "자개",
] as const;

export const TEXTURE_OPTIONS = [
  "소녀 인물 일러스트",
  "동물 마스코트",
  "천사 악마 고딕",
  "흑백 낙서풍",
  "몽환 SF",
  "소년 만화풍",
  "수공예",
  "일상툰",
] as const;

export const LINK_KINDS = ["instagram", "x", "site", "store", "other"] as const;
export const LINK_KIND_LABEL: Record<(typeof LINK_KINDS)[number], string> = {
  instagram: "인스타그램",
  x: "X",
  site: "사이트",
  store: "판매 페이지",
  other: "기타",
};

const text = (max: number) => z.string().trim().min(1).max(max);
const list = <T extends z.ZodType>(item: T, max = 30) => z.array(item).min(1).max(max);

/** 칸 값의 모양. 저장 전에 반드시 이걸로 검사한다(API, mock, 워커 모두). */
export const FIELD_VALUE_SCHEMAS = {
  text60: text(60),
  text200: text(200),
  url: z.url().max(1000),
  list: list(text(80)),
  items: list(z.enum(ITEM_OPTIONS)),
  links: list(z.object({ kind: z.enum(LINK_KINDS), url: z.url().max(1000) }).strict(), 20),
  range: z
    .object({ min: z.number().int().min(0), max: z.number().int().min(0), currency: z.literal("KRW") })
    .strict()
    .refine((r) => r.min <= r.max, "최솟값이 최댓값보다 커요"),
  texture: z
    .object({ tags: z.array(z.enum(TEXTURE_OPTIONS)).max(8), note: z.string().trim().max(120).optional() })
    .strict()
    .refine((t) => t.tags.length > 0 || !!t.note, "태그나 한 줄 중 하나는 있어야 해요"),
  why: z
    .object({ summary: text(400), original: z.string().trim().max(4000).optional() })
    .strict(),
  photos: list(z.object({ path: text(1000), scope: text(200) }).strict(), 20),
  /**
   * 설명 문장(2026-11-03 Ted 결정). 원문은 그대로 두고, 앱에 보일 말투 변환본(display)을
   * 따로 둔다. display의 출처는 원문이다. gate는 결정적 게이트(tone-gate.ts) 결과.
   */
  prose: z
    .object({
      original: text(4000),
      display: z.string().trim().min(1).max(4000).optional(),
      gate: z.object({ ok: z.boolean(), issues: z.array(z.string().max(200)).max(30) }).strict().optional(),
    })
    .strict(),
} as const;
export type FieldValueKind = keyof typeof FIELD_VALUE_SCHEMAS;

export interface FieldDef {
  key: string;
  label: string;
  kind: FieldValueKind;
  /** 기준 문서 3, 4장 "채우는 방법". 화면 안내용. */
  fill: string;
  /** 작가 말만 담는 칸 — AI 추측 금지, 작가 확인이 끝이다. */
  artistOnly?: boolean;
}

/** 3장 브랜드 칸(박람회가 바뀌어도 그대로인 것). */
export const BRAND_FIELDS: FieldDef[] = [
  { key: "artistName", label: "작가명", kind: "text60", fill: "공식 상세에서 자동" },
  {
    key: "intro",
    label: "공식 소개",
    kind: "prose",
    fill: "공식 소개 원문은 그대로, 앱에는 말투만 고친 문장을 보여요(워커가 바꾸고 게이트가 검사)",
  },
  { key: "aliases", label: "다른 이름", kind: "list", fill: "공식 목록 대조로 자동, 검색에만 써요" },
  { key: "links", label: "링크", kind: "links", fill: "공식 상세, 작가 페이지에서 자동" },
  { key: "identityLine", label: "정체 한 줄", kind: "text60", fill: "AI 초안 뒤 검수. 근거 칸이 비면 쓰지 않아요" },
  { key: "items", label: "품목", kind: "items", fill: "공식 태그, 판매 페이지에서 모아 AI가 정리" },
  { key: "signatureWorks", label: "대표 작품", kind: "list", fill: "AI 초안 뒤 검수" },
  { key: "priceRange", label: "가격대", kind: "range", fill: "판매 페이지에서 자동" },
  { key: "texture", label: "어떤 결인가", kind: "texture", fill: "AI 초안 뒤 에디터 확인" },
  { key: "whyMake", label: "왜 만드나", kind: "why", fill: "작가 답만. AI가 정리하고 작가가 확인해요", artistOnly: true },
  { key: "photos", label: "대표 사진", kind: "photos", fill: "작가 허락 범위와 함께 사람이 넣어요" },
];

/** 4장 출전 칸(박람회마다). 부스명과 부스 번호는 booth에서 읽는다. */
export const PARTICIPANT_FIELDS: FieldDef[] = [
  { key: "days", label: "참가일", kind: "text60", fill: "공식 목록에서 자동(토, 일, 양일 등)" },
  { key: "items", label: "그 회차 품목과 신상품", kind: "list", fill: "자동 수집 뒤 AI 정리" },
  { key: "boothcutUrl", label: "부스컷", kind: "url", fill: "공식 부스 이미지 링크" },
];

export function fieldDef(subject: ProfileSubject, key: string): FieldDef | undefined {
  return ("exhibitorId" in subject ? BRAND_FIELDS : PARTICIPANT_FIELDS).find((f) => f.key === key);
}

export function profileFieldId(subject: ProfileSubject, field: string): string {
  return "exhibitorId" in subject ? `ex:${subject.exhibitorId}:${field}` : `pt:${subject.participantId}:${field}`;
}

/** 칸 값을 검사한다. 모르는 칸이면 에러 메시지, 통과하면 정리된 값. */
export function parseFieldValue(
  subject: ProfileSubject,
  key: string,
  value: unknown,
): { ok: true; value: unknown } | { ok: false; message: string } {
  const def = fieldDef(subject, key);
  if (!def) return { ok: false, message: "없는 칸이에요" };
  const r = FIELD_VALUE_SCHEMAS[def.kind].safeParse(value);
  if (!r.success) return { ok: false, message: r.error.issues[0]?.message ?? "값을 확인해 주세요" };
  return { ok: true, value: r.data };
}

/**
 * 관리자가 칸을 저장할 때의 상태 규칙(기준 문서 5장, 2026-11-03 Ted 결정).
 * - 고치면 reviewed.
 * - 작가에게 확인받았다고 표시하면 artist_confirmed.
 * - 부스 정보를 그대로 가져온 것만 collected(출처가 `roam:booth/`여야 한다).
 * - "왜 만드나"는 작가 말만 담는 칸이라 출처가 없으면 저장하지 않는다.
 * ai_draft와 stale은 워커만 쓴다.
 */
export const ADMIN_SETTABLE_STATUSES = ["reviewed", "artist_confirmed", "collected"] as const;
export type AdminSettableStatus = (typeof ADMIN_SETTABLE_STATUSES)[number];

export function adminStatusError(
  subject: ProfileSubject,
  key: string,
  status: AdminSettableStatus,
  sources: string[],
): string | null {
  const def = fieldDef(subject, key);
  if (status === "collected" && (sources.length === 0 || !sources.every((s) => s.startsWith("roam:booth/"))))
    return "공식 자료로 표시하려면 부스 정보에서 가져온 값이어야 해요";
  if (def?.artistOnly && sources.length === 0) return "작가 답이 있는 곳(연락 기록이나 링크)을 출처로 적어 주세요";
  return null;
}

/** 칸 채움 요약 — 목록의 "프로필 채움 정도". 확인된 칸 = collected, reviewed, artist_confirmed. */
export interface FillSummary {
  total: number;
  confirmed: number;
  aiDraft: number;
  stale: number;
  empty: number;
}

const CONFIRMED: ReadonlySet<ProfileFieldStatus> = new Set(["collected", "reviewed", "artist_confirmed"]);

export function summarizeFill(fields: Pick<ProfileField, "field" | "status">[]): FillSummary {
  const byKey = new Map(fields.map((f) => [f.field, f.status]));
  const s: FillSummary = { total: BRAND_FIELDS.length, confirmed: 0, aiDraft: 0, stale: 0, empty: 0 };
  for (const def of BRAND_FIELDS) {
    const st = byKey.get(def.key);
    if (!st) s.empty++;
    else if (st === "ai_draft") s.aiDraft++;
    else if (st === "stale") s.stale++;
    else if (CONFIRMED.has(st)) s.confirmed++;
  }
  return s;
}

export type FillLevel = "empty" | "partial" | "full";
export function fillLevel(s: FillSummary): FillLevel {
  if (s.confirmed === 0) return "empty";
  return s.confirmed === s.total ? "full" : "partial";
}

/**
 * 앱과 카드뉴스가 사실로 써도 되는 값(2026-11-03 Ted 결정, 기준 문서 5장 개정).
 * - 사실 칸: collected부터(공식 자료 그대로는 검수 없이 보여도 된다).
 * - 설명 문장 칸(prose): 원문이 아니라 말투 변환본(display)만. 게이트를 넘었거나
 *   사람이 확인(reviewed, artist_confirmed)한 것만.
 * - ai_draft, stale은 보이지 않는다.
 * 지금 앱은 이 칸을 아직 읽지 않는다 — 읽게 될 때 이 함수 하나를 통과시킨다.
 */
export function publicValue(def: FieldDef, field: Pick<ProfileField, "status" | "value"> | undefined): unknown {
  if (!field) return undefined;
  const st = field.status;
  if (st === "ai_draft" || st === "stale") return undefined;
  if (def.artistOnly && st !== "artist_confirmed") return undefined;
  if (def.kind === "prose") {
    const v = field.value as { display?: string; gate?: { ok: boolean } };
    if (!v.display) return undefined;
    if (st === "collected" && !v.gate?.ok) return undefined;
    return v.display;
  }
  return field.value;
}

/** AI가 초안을 쓰는 칸(ai_draft). 나머지는 결정적으로 모으거나(collected) 사람 몫이다. */
export const AI_DRAFT_FIELDS = ["identityLine", "items", "signatureWorks", "texture"] as const;
/** 정체 한 줄의 근거가 되는 칸 — 하나도 없으면 정체 한 줄을 쓰지 않는다(3장). */
export const IDENTITY_BASIS_FIELDS = ["items", "signatureWorks", "texture", "intro"] as const;
/** 새 출전이 이어지면 다시 볼 칸(6장 ⑦, 2026-11-03 Ted 결정). */
export const STALE_ON_NEW_APPEARANCE = ["items", "priceRange", "signatureWorks"] as const;

/**
 * 워커가 이 칸을 써도 되나(덮어쓰기 규칙). 빈 칸, 다시 볼 칸, AI 초안만 쓴다.
 * 사람이 확인한 칸(reviewed, artist_confirmed)과 이미 모은 공식 자료(collected)는 건드리지 않는다.
 */
export function workerMayWrite(existing: Pick<ProfileField, "status"> | undefined): boolean {
  return !existing || existing.status === "stale" || existing.status === "ai_draft";
}

/**
 * 원문만 있고 말투 변환본이 없는 공식 소개(collected). 워커가 원문과 출처를 그대로 둔 채
 * display만 채워도 되는 유일한 예외다 — 브랜드 먼저 인입(brands.v1)과 LLM 없이 돈 워커가
 * 이렇게 남긴다. 사람 확인 상태(reviewed, artist_confirmed)는 사람이 고친다.
 */
export function introNeedsTone(existing: Pick<ProfileField, "status" | "value"> | undefined): boolean {
  if (!existing || existing.status !== "collected") return false;
  const v = existing.value as { original?: unknown; display?: unknown } | null;
  return !!v && typeof v.original === "string" && !v.display;
}

/** 새 출전이 이어졌을 때 stale로 돌릴 칸. 이미 stale이거나 빈 칸은 뺀다. */
export function staleOnNewAppearance(fields: Pick<ProfileField, "field" | "status">[]): string[] {
  const keys = new Set<string>(STALE_ON_NEW_APPEARANCE);
  return fields.filter((f) => keys.has(f.field) && f.status !== "stale").map((f) => f.field);
}

/**
 * 브랜드를 합칠 때(같은 브랜드로 연결 승인) 칸 옮기기 계획. 대상에 이미 있는 칸은
 * 대상 것을 지키고, 대상에 없는 칸만 옮긴다. 옮기지 않은 칸은 사라진다(대상이 이긴다).
 */
export function planFieldMerge(
  fromFields: Pick<ProfileField, "field">[],
  toFields: Pick<ProfileField, "field">[],
): { move: string[]; drop: string[] } {
  const has = new Set(toFields.map((f) => f.field));
  const move: string[] = [];
  const drop: string[] = [];
  for (const f of fromFields) (has.has(f.field) ? drop : move).push(f.field);
  return { move, drop };
}
