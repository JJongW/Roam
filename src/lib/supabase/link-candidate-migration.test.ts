// 0073(참가 단위 연결 후보)과 코드가 같은 계약을 말하는지 본다. DB를 띄우지 않는다 — SQL은 PGlite로
// 따로 돌려 봤고(결정 기록), 여기서는 파일과 타입이 어긋나지 않게 묶는다.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, expectTypeOf, it } from "vitest";
import type { ExhibitorGraph, ExhibitorLinkCandidate } from "@/lib/types";
import type { ExhibitorPlan } from "@/lib/exhibitor/plan";
import { candidateKeys } from "@/lib/exhibitor/plan";

const read = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), "utf8");
const sql = read("../../../supabase/migrations/0073_link_candidate_participation.sql");
const repo = read("./repository.ts");
const strip = (s: string) =>
  s
    .split("\n")
    .filter((l) => !l.trim().startsWith("--"))
    .join("\n")
    .replace(/\s+/g, " ");

describe("0073 연결 후보 = 참가 단위", () => {
  it("부스를 선택으로 풀고, 참가 짝 unique와 '하나는 가리킨다' check를 둔다", () => {
    const body = strip(sql);
    expect(body).toContain("alter table exhibitor_link_candidate alter column booth_id drop not null");
    expect(body).toContain("unique (participant_id, exhibitor_id)");
    expect(body).toContain("check (participant_id is not null or booth_id is not null)");
    // 더하기만: 표나 칸을 지우지 않는다(되돌리기는 주석에만).
    expect(body).not.toMatch(/drop table|drop column|delete from/);
    expect(body.trim().startsWith("begin;")).toBe(true);
    expect(body.trim().endsWith("commit;")).toBe(true);
  });

  it("저장소가 0073의 unique 열쇠로 넣고, 부스 없는 행을 null로 읽는다", () => {
    expect(repo).toContain('"participant_id,exhibitor_id"');
    expect(repo).toContain('"booth_id,exhibitor_id"');
    expect(repo).toContain('select("booth_id,participant_id,exhibitor_id,status")');
    expect(repo).toMatch(/boothId: optStr\(r\.booth_id\) \?\? null/);
  });

  it("타입: 후보의 부스는 null일 수 있고, 계획 후보는 참가가 필수다", () => {
    expectTypeOf<ExhibitorLinkCandidate["boothId"]>().toEqualTypeOf<string | null>();
    expectTypeOf<ExhibitorGraph["candidates"][number]["boothId"]>().toEqualTypeOf<string | null>();
    expectTypeOf<ExhibitorGraph["candidates"][number]["participantId"]>().toEqualTypeOf<string | null>();
    expectTypeOf<ExhibitorPlan["candidates"][number]["boothId"]>().toEqualTypeOf<string | undefined>();
    expectTypeOf<ExhibitorPlan["candidates"][number]>().toHaveProperty("participantRef");
  });

  it("이미 낸 짝 열쇠는 참가가 먼저, 옛 행은 부스로도", () => {
    expect([...candidateKeys([{ boothId: "b1", participantId: "p1", exhibitorId: "ex" }, { boothId: null, participantId: "p2", exhibitorId: "ex" }])]).toEqual([
      "pt:p1|ex",
      "b1|ex",
      "pt:p2|ex",
    ]);
  });
});
