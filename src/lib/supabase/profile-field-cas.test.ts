import { describe, expect, it, vi, beforeEach } from "vitest";

/** 테이블과 동작을 기록하는 가짜 클라이언트. brand_profile_field 쓰기가 돌려줄 행은 `written`이 정한다. */
type Op = { table: string; ops: string[]; args: unknown[][] };
const calls: Op[] = [];
let written: unknown[] = [];

function respond(table: string, ops: string[]): { data: unknown; error: unknown } {
  if (table === "exhibitor" && ops.includes("maybeSingle")) return { data: { id: "ex1" }, error: null };
  if (table === "brand_profile_field") return { data: written, error: null };
  return { data: [], error: null };
}

function builder(table: string) {
  const rec: Op = { table, ops: [], args: [] };
  calls.push(rec);
  const b: Record<string, unknown> = {};
  for (const m of ["select", "update", "upsert", "insert", "eq", "in", "maybeSingle", "single"])
    b[m] = (...a: unknown[]) => {
      rec.ops.push(m);
      rec.args.push(a);
      return b;
    };
  b.then = (ok: (v: unknown) => unknown, bad: (e: unknown) => unknown) => Promise.resolve(respond(table, rec.ops)).then(ok, bad);
  return b;
}

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => ({ from: builder }),
  createClient: async () => ({}),
}));

async function repo() {
  vi.resetModules();
  const { SupabaseRepository } = await import("./repository");
  return new SupabaseRepository();
}

const input = {
  subject: { exhibitorId: "ex1" },
  field: "items",
  value: ["엽서"],
  sources: ["roam:booth/b1"],
  status: "ai_draft" as const,
  actor: "worker:brand-profile-draft",
};
const row = { id: "ex:ex1:items", exhibitor_id: "ex1", field: "items", value: ["엽서"], sources: [], status: "ai_draft", verified_at: "t", created_at: "t", updated_at: "t" };
const fieldWrite = () => calls.find((c) => c.table === "brand_profile_field")!;

beforeEach(() => {
  calls.length = 0;
  written = [];
});

describe("SupabaseRepository 프로필 칸 조건부 쓰기", () => {
  it("있던 칸은 읽은 상태와 updated_at이 그대로일 때만 update한다(조건은 DB가 본다)", async () => {
    written = [row];
    const r = await (await repo()).upsertProfileFieldIfUnchanged(input, { status: "stale", updatedAt: "2026-11-17T01:00:00.000+00:00" });
    expect(r.ok).toBe(true);
    const w = fieldWrite();
    expect(w.ops.slice(0, 1)).toEqual(["update"]);
    expect(w.args.filter((_, i) => w.ops[i] === "eq")).toEqual([
      ["id", "ex:ex1:items"],
      ["status", "stale"],
      ["updated_at", "2026-11-17T01:00:00.000+00:00"],
    ]);
    expect(w.ops).not.toContain("upsert");
  });

  it("그사이 바뀌어 0행이면 changed를 돌려준다", async () => {
    written = [];
    const r = await (await repo()).upsertProfileFieldIfUnchanged(input, { status: "ai_draft", updatedAt: "t0" });
    expect(r).toEqual({ ok: false, reason: "changed" });
  });

  it("없던 칸은 on conflict do nothing으로 넣고, 그사이 누가 만들었으면 changed", async () => {
    written = [];
    const r = await (await repo()).upsertProfileFieldIfUnchanged(input, null);
    expect(r).toEqual({ ok: false, reason: "changed" });
    const w = fieldWrite();
    expect(w.ops[0]).toBe("upsert");
    expect(w.args[0][1]).toEqual({ onConflict: "id", ignoreDuplicates: true });
  });
});
