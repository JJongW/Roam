import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { intakeFileSchema } from "@/lib/intake/schema";
import { FLOORPLANS } from "@/lib/floorplans";

// 레포에 남긴 인입 파일이 재생 경로다("파일 → 인입 재실행"). 계약을 깨진 채로
// 두면 그 재생이 업로드 시점에야 실패한다 — 여기서 먼저 걸린다.
const DIR = join(process.cwd(), "data/intake");
// _backup·_review 등 밑줄로 시작하는 것은 계약 파일이 아니다.
const files = readdirSync(DIR).filter((f) => f.endsWith(".json") && !f.startsWith("_"));

describe("data/intake 파일", () => {
  it("파일이 있다", () => expect(files.length).toBeGreaterThan(0));

  for (const f of files) {
    describe(f, () => {
      const raw = JSON.parse(readFileSync(join(DIR, f), "utf8"));
      const parsed = intakeFileSchema.safeParse(raw);

      it("intake.v1 계약을 만족한다", () => {
        expect(parsed.error?.issues ?? []).toEqual([]);
      });

      it("부스 코드가 유일하다", () => {
        const codes = raw.booths.map((b: { code: string }) => b.code);
        const dup = codes.filter((c: string, i: number) => codes.indexOf(c) !== i);
        expect(dup).toEqual([]);
      });

      it("좌표를 대줄 도면이 있고 코드가 전부 도면에 있다", () => {
        // 좌표는 계약에 없다 — FLOORPLANS가 code로 대준다. 도면에 없는 코드는
        // 지도에 안 뜨는 부스가 된다.
        const fp = FLOORPLANS[raw.exhibitionSlug];
        expect(fp, `도면 없음: ${raw.exhibitionSlug}`).toBeTruthy();
        const known = new Set(fp.booths.map((b) => b.code));
        const missing = raw.booths
          .map((b: { code: string }) => b.code)
          .filter((c: string) => !known.has(c));
        expect(missing).toEqual([]);
      });
    });
  }
});
