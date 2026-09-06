/**
 * 변경 이력의 순수 부분. **엔티티에 묶지 않는다** — 지금은 부스 저작 정보가
 * 급하지만, 인입은 부스 본체(name·description·images)도 바꾸고 앞으로 전시·이벤트·
 * LLM 초안도 같은 원장이 필요하다. 여기서 enrichment에 묶으면 그때마다 다시 만든다.
 *
 * 그래서 이 모듈이 아는 건 "before·after·볼 필드 목록"뿐이고, 무엇을 보는지는
 * 호출부가 정한다.
 */

/** 필드 하나의 변경. before가 null이면 새로 채워진 것이다. */
export interface FieldDiff {
  before: unknown;
  after: unknown;
}

/** 필드명 → 변경. 안 바뀐 필드는 아예 담지 않는다. */
export type FieldDiffs = Record<string, FieldDiff>;

/** 이력이 붙는 대상. 새 엔티티는 여기에 문자열 하나 추가하면 된다. */
export type AuditEntity = "booth_enrichment" | "booth" | "exhibition" | "event";

/** 변경을 일으킨 경로. **열린 집합이다** — drafter·참가사 폼 같은 새 입력구가
 *  생겨도 마이그레이션 없이 값만 늘어난다(DB도 enum이 아니라 text). */
export type AuditSource = "intake" | "admin" | "drafter" | "participant" | string;

/** 쓰기 호출부가 밝히는 출처. 저장소가 이걸 받아 이력을 남긴다. */
export interface AuditContext {
  source: AuditSource;
  actor?: string | null;
  reason?: string | null;
}

export interface ChangeEntry {
  entity: AuditEntity;
  entityId: string;
  /** 조회를 좁히는 축. 부스면 그 전시, 전시면 자기 자신. 없으면 null. */
  scopeId?: string | null;
  source: AuditSource;
  /** 누가. 로그인 사용자 id, 없으면 null(조직자 코드 게이트 등). */
  actor?: string | null;
  fieldDiffs: FieldDiffs;
  reason?: string | null;
}

/** 값이 "비었다"를 한 가지로 본다 — 빈 문자열·빈 배열·빈 객체·null·undefined. */
export function isBlank(v: unknown): boolean {
  if (v == null) return true;
  if (typeof v === "string") return v.trim() === "";
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === "object") return Object.keys(v).length === 0;
  return false;
}

function norm(v: unknown): unknown {
  return isBlank(v) ? null : v;
}

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(norm(a)) === JSON.stringify(norm(b));
}

/**
 * before → after 중 실제로 바뀐 필드만 뽑는다.
 *
 * ⚠️ **after에 키가 없으면 변경이 아니다.** 쓰기 경로가 키 없는 필드를 안 건드리기
 * 때문이다(PostgREST upsert가 실린 컬럼만 갱신). 이걸 변경으로 세면 그 필드를 안
 * 보내는 화면이 저장할 때마다 "남이 쓴 값을 지웠다"고 이력에 남는다.
 */
export function diffFields(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown>,
  fields: readonly string[],
): FieldDiffs {
  const diffs: FieldDiffs = {};
  for (const field of fields) {
    if (!(field in after)) continue;
    if (same(after[field], before?.[field])) continue;
    diffs[field] = { before: norm(before?.[field]), after: norm(after[field]) };
  }
  return diffs;
}

/**
 * 되돌리기 페이로드 — 이력의 before를 그대로 다시 쓸 수 있는 모양으로.
 * 신규로 채워졌던 필드(before null)는 그 필드 타입의 빈 값으로 되돌린다.
 */
export function revertPayload(
  diffs: FieldDiffs,
  emptyFor: (field: string) => unknown,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [field, d] of Object.entries(diffs)) {
    out[field] = d.before ?? emptyFor(field);
  }
  return out;
}
