// 브랜드 칸 검수 학습(루프 A의 칸 단위판). 순수 함수.
//
// 관리자가 AI 초안 칸을 저장하면 change_log에 entity "brand_profile_field"로 전과 후가
// 남는다(field_diffs: status, value). 여기서 칸마다 "그대로 승인"과 "고쳐서 승인"을 세고,
// 고친 뒤 값을 다음 초안의 예시로 준다 — lib/enrichment/lessons.ts와 같은 생각이다.
// 한 번 고친 걸 규칙으로 올리지 않는다: 예시는 예시로만 주고, 지침은 반복된 것만.
import type { ChangeRecord } from "@/lib/types";

export interface FieldLesson {
  field: string;
  approved: number;
  corrected: number;
  /** 고친 뒤 값(최근 것 먼저, 최대 3개). */
  examples: string[];
}

/** 칸 id(`ex:<id>:<field>`, `pt:<id>:<field>`)에서 칸 key. */
export function fieldKeyOf(entityId: string): string {
  return entityId.split(":").pop() ?? entityId;
}

function show(v: unknown): string {
  if (typeof v === "string") return v;
  if (v && typeof v === "object" && "display" in v && typeof (v as { display?: unknown }).display === "string")
    return (v as { display: string }).display;
  return JSON.stringify(v);
}

export function brandFieldLessons(changes: ChangeRecord[], maxExamples = 3): FieldLesson[] {
  const by = new Map<string, FieldLesson>();
  // 최신 먼저 들어온다고 가정하지 않는다 — 시각으로 정렬한다.
  const sorted = [...changes]
    .filter((c) => c.entity === "brand_profile_field")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  for (const c of sorted) {
    const st = c.fieldDiffs.status;
    // AI 초안에서 사람이 확인한 상태로 넘어간 기록만 학습 재료다.
    if (!st || st.before !== "ai_draft") continue;
    const key = fieldKeyOf(c.entityId);
    const l = by.get(key) ?? { field: key, approved: 0, corrected: 0, examples: [] };
    if (c.fieldDiffs.value) {
      l.corrected++;
      if (l.examples.length < maxExamples) l.examples.push(show(c.fieldDiffs.value.after));
    } else l.approved++;
    by.set(key, l);
  }
  return [...by.values()].sort((a, b) => b.corrected - a.corrected);
}

/** 프롬프트에 넣을 줄. 고친 적이 없는 칸은 넣지 않는다. */
export function lessonLines(lessons: FieldLesson[]): string[] {
  return lessons
    .filter((l) => l.corrected > 0)
    .map(
      (l) =>
        `${l.field}: 에디터가 ${l.corrected + l.approved}번 중 ${l.corrected}번 고쳤어요. 고친 예: ${l.examples.map((e) => `"${e}"`).join(", ")}`,
    );
}
