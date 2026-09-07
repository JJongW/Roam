import { describe, expect, it, vi, beforeEach } from "vitest";
import { getRepository } from "@/lib/repositories";

vi.mock("@/lib/api/http", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/http")>()),
  requireAdmin: async () => null,
}));

import { GET } from "./route";

beforeEach(() => {
  (globalThis as unknown as { __roamStore?: unknown }).__roamStore = undefined;
});

const payload = {
  summary: "요약",
  valueTags: [],
  recommendationReasons: {},
  thingsToDo: [],
  timing: [],
  memoryHooks: [],
};

describe("GET /api/admin/changes", () => {
  it("엔티티·대상으로 좁혀 읽는다", async () => {
    const repo = await getRepository();
    await repo.upsertBoothEnrichment("b_a1902", payload, {
      source: "intake",
      actor: "u_1",
    });

    const all = await (
      await GET(new Request("http://localhost/api/admin/changes"))
    ).json();
    expect(all.data.changes).toHaveLength(1);

    const scoped = await (
      await GET(
        new Request(
          "http://localhost/api/admin/changes?entity=booth_enrichment&entityId=b_a1902",
        ),
      )
    ).json();
    expect(scoped.data.changes[0].source).toBe("intake");

    const miss = await (
      await GET(new Request("http://localhost/api/admin/changes?entityId=nope"))
    ).json();
    expect(miss.data.changes).toHaveLength(0);
  });
});
