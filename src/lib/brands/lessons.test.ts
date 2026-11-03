import { describe, expect, it } from "vitest";
import { brandFieldLessons, fieldKeyOf, lessonLines } from "./lessons";
import type { ChangeRecord } from "@/lib/types";

const rec = (entityId: string, diffs: ChangeRecord["fieldDiffs"], createdAt: string): ChangeRecord => ({
  id: createdAt,
  entity: "brand_profile_field",
  entityId,
  source: "admin",
  fieldDiffs: diffs,
  createdAt,
});

describe("brandFieldLessons", () => {
  it("AI 초안에서 확인으로 넘어간 기록만 센다, 고친 뒤 값을 최근 것부터 예시로", () => {
    const changes = [
      rec("ex:x1:identityLine", { status: { before: "ai_draft", after: "reviewed" }, value: { before: "옛 문장", after: "고친 문장 하나예요" } }, "2026-11-01"),
      rec("ex:x2:identityLine", { status: { before: "ai_draft", after: "reviewed" }, value: { before: "a", after: "고친 문장 둘이에요" } }, "2026-11-02"),
      rec("ex:x3:identityLine", { status: { before: "ai_draft", after: "reviewed" } }, "2026-11-03"),
      rec("ex:x4:items", { status: { before: "ai_draft", after: "reviewed" } }, "2026-11-03"),
      // 사람이 쓴 칸을 다시 고친 건 학습 재료가 아니다.
      rec("ex:x5:items", { status: { before: "reviewed", after: "reviewed" }, value: { before: ["a"], after: ["b"] } }, "2026-11-03"),
    ];
    const ls = brandFieldLessons(changes);
    expect(ls[0]).toEqual({ field: "identityLine", approved: 1, corrected: 2, examples: ["고친 문장 둘이에요", "고친 문장 하나예요"] });
    expect(ls.find((l) => l.field === "items")).toMatchObject({ approved: 1, corrected: 0 });
    expect(lessonLines(ls)).toEqual(['identityLine: 에디터가 3번 중 2번 고쳤어요. 고친 예: "고친 문장 둘이에요", "고친 문장 하나예요"']);
  });

  it("칸 id에서 칸 key", () => {
    expect(fieldKeyOf("pt:p_1:days")).toBe("days");
  });
});
