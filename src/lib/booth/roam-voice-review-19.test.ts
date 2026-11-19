// `scripts/roam-voice-review-19.json`(Ted가 승인한 19칸, 2026-11-19)을 검사한다.
// - after는 가운뎃점, 반말, 합니다체, [cite]가 없다.
// - after는 before와 같은 키를 같은 순서로 가진다(jsonb 칸).
// - before는 백필이 남긴 review 파일과 같다. review 파일은 레포 밖(작업 임시 폴더)에 있어
//   없으면 그 검사만 건너뛴다. 운영에서는 스크립트가 운영 값 == before일 때만 바꿔 같은 것을 다시 본다.
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { sameValue, voiceProblems } from "../../../scripts/roam-voice-db-helpers";
import rawTable from "../../../scripts/roam-voice-review-19.json";

interface Entry {
  table: string;
  keyCol: string;
  key: string;
  slug: string;
  code: string | null;
  field: string;
  before: unknown;
  after: unknown;
}
const table = rawTable as Entry[];
const REVIEW_FILE = "/Users/sinjong-won/.claude/jobs/1b54bc24/tmp/db-voice-diff-3.json";

describe("roam-voice-review-19 표", () => {
  it("19칸이고 칸마다 하나씩이다", () => {
    expect(table).toHaveLength(19);
    expect(new Set(table.map((e) => `${e.table}:${e.key}:${e.field}`)).size).toBe(19);
    for (const e of table) expect(e.keyCol).toBe(e.table === "exhibition" ? "id" : "booth_id");
  });

  it.each(table.map((e) => [`${e.slug} ${e.code ?? ""} ${e.field}`, e] as const))(
    "after는 말투 검사를 통과한다: %s",
    (_, e) => {
      expect(voiceProblems(e.after)).toEqual([]);
      expect(sameValue(e.before, e.after)).toBe(false);
      if (e.after && typeof e.after === "object")
        expect(Object.keys(e.after)).toEqual(Object.keys(e.before as object));
    },
  );

  it("before는 고칠 거리가 있었다(가운뎃점, 말투, [cite] 중 하나 이상)", () => {
    for (const e of table.filter((x) => x.after !== null)) expect(voiceProblems(e.before).length).toBeGreaterThan(0);
  });

  it("카페쇼 못 찾았다는 로미 한 줄 8건만 비운다", () => {
    const nulls = table.filter((e) => e.after === null);
    expect(nulls.map((e) => e.code).sort()).toEqual(["A339", "B126", "B137", "B430", "C667", "C743", "D154", "D261"]);
    for (const e of nulls) {
      expect(e.slug).toBe("cafeshow-2026");
      expect(e.field).toBe("roam_interpretation");
    }
  });

  it.skipIf(!existsSync(REVIEW_FILE))("before는 백필 review 파일과 같다", () => {
    const review = (JSON.parse(readFileSync(REVIEW_FILE, "utf8")) as { review: Entry[] }).review;
    expect(review).toHaveLength(table.length);
    for (const r of review) {
      const e = table.find((x) => x.table === r.table && x.key === r.key && x.field === r.field);
      expect(e, `${r.key}.${r.field}`).toBeDefined();
      expect(sameValue(e!.before, r.before)).toBe(true);
    }
  });
});
