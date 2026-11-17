import { describe, expect, it, vi, beforeEach } from "vitest";

/** 테이블과 동작을 기록하는 가짜 클라이언트. 결과는 respond(table, ops)가 정한다. */
type Op = { table: string; ops: string[]; args: unknown[][] };
const calls: (Op | { rpc: string; args: unknown })[] = [];
let missingOutreachTables = false;

function respond(table: string, ops: string[], args: unknown[][]): { data: unknown; error: unknown } {
  const eq = (col: string) => args.find((a, i) => ops[i] === "eq" && a[0] === col)?.[1];
  if (table === "participant_permission" && ops[0] === "select")
    return missingOutreachTables ? { data: null, error: { message: "relation does not exist" } } : { data: [], error: null };
  if (table === "exhibitor_link_candidate" && ops.includes("maybeSingle"))
    return { data: { id: "xlc1", booth_id: "b1", exhibitor_id: "ex_to", status: "pending" }, error: null };
  if (table === "booth_participant" && ops.includes("maybeSingle")) return { data: { participant_id: "pt_from" }, error: null };
  if (table === "exhibition_participant" && ops.includes("single")) return { data: { exhibitor_id: "ex_from" }, error: null };
  if (table === "exhibition_participant" && ops[0] === "select" && eq("exhibitor_id") === "ex_from")
    return { data: [{ id: "pt_from", exhibition_id: "exh1" }], error: null };
  if (table === "exhibition_participant" && ops.includes("maybeSingle")) return { data: { id: "pt_to" }, error: null };
  if (table === "exhibitor_link_candidate" && ops[0] === "update")
    return { data: { id: "xlc1", booth_id: "b1", exhibitor_id: "ex_to", status: "approved", reason: "x", created_at: "t" }, error: null };
  return { data: [], error: null };
}

function builder(table: string) {
  const rec: Op = { table, ops: [], args: [] };
  calls.push(rec);
  const b: Record<string, unknown> = {};
  for (const m of ["select", "update", "delete", "insert", "upsert", "eq", "in", "limit", "order", "range", "maybeSingle", "single"])
    b[m] = (...a: unknown[]) => {
      rec.ops.push(m);
      rec.args.push(a);
      return b;
    };
  b.then = (ok: (v: unknown) => unknown, bad: (e: unknown) => unknown) =>
    Promise.resolve(respond(table, rec.ops, rec.args)).then(ok, bad);
  return b;
}

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => ({
    from: builder,
    rpc: async (fn: string, args: unknown) => {
      calls.push({ rpc: fn, args });
      return { data: 1, error: null };
    },
  }),
  createClient: async () => ({}),
}));

/** 테이블 확인 결과를 모듈이 기억하므로(있을 때만) 테스트마다 새로 불러온다. */
async function freshRepo() {
  vi.resetModules();
  const { SupabaseRepository } = await import("./repository");
  return new SupabaseRepository();
}

const label = (c: (typeof calls)[number]) =>
  "rpc" in c ? `rpc:${c.rpc}` : c.ops[0] === "delete" ? `delete:${c.table}` : null;

beforeEach(() => {
  calls.length = 0;
});

describe("SupabaseRepository 브랜드 합치기 — 연락 옮기기(0062)", () => {
  it("출전과 브랜드를 지우기 전에 move 함수를 부른다", async () => {
    missingOutreachTables = false;
    await (await freshRepo()).decideExhibitorLinkCandidate("xlc1", "approved", "ted");
    const order = calls.map(label).filter(Boolean);
    expect(calls).toContainEqual({ rpc: "move_participant_permission", args: { p_from: "pt_from", p_to: "pt_to" } });
    expect(calls).toContainEqual({ rpc: "move_brand_outreach", args: { p_from: "ex_from", p_to: "ex_to" } });
    expect(order.indexOf("rpc:move_participant_permission")).toBeLessThan(order.indexOf("delete:exhibition_participant"));
    expect(order.indexOf("rpc:move_brand_outreach")).toBeLessThan(order.indexOf("delete:exhibitor"));
  });

  it("연락 테이블이 없으면(부스 키 폴백) 부르지 않는다", async () => {
    missingOutreachTables = true;
    await (await freshRepo()).decideExhibitorLinkCandidate("xlc1", "approved", "ted");
    const rpcs = calls.flatMap((c) => ("rpc" in c ? [c.rpc] : []));
    expect(rpcs).not.toContain("move_participant_permission");
    expect(rpcs).not.toContain("move_brand_outreach");
    expect(rpcs).toContain("move_brand_profile_fields");
  });
});
