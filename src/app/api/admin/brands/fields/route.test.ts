import { beforeEach, describe, expect, it, vi } from "vitest";
import { getRepository } from "@/lib/repositories";
import { planFromRepository } from "@/lib/exhibitor/service";

const auth = vi.hoisted(() => ({ admin: true }));
vi.mock("@/lib/api/http", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/api/http")>();
  return {
    ...mod,
    requireAdmin: async () => (auth.admin ? null : mod.fail("UNAUTHORIZED", "운영자 인증이 필요합니다")),
    getAdminActor: async () => "ted@example.com",
  };
});

import { PATCH } from "./route";
import { POST as LINKS } from "../links/route";
import { POST as DRAFT } from "../[id]/draft/route";

beforeEach(() => {
  (globalThis as unknown as { __roamStore?: unknown }).__roamStore = undefined;
  auth.admin = true;
});

const req = (url: string, body: unknown, method = "PATCH") =>
  new Request(`http://localhost${url}`, { method, body: JSON.stringify(body), headers: { "content-type": "application/json" } });

async function seedGraph() {
  const repo = await getRepository();
  const { plan } = await planFromRepository(repo);
  await repo.applyExhibitorPlan(plan);
  return { repo, graph: await repo.loadExhibitorGraph() };
}

describe("PATCH /api/admin/brands/fields", () => {
  it("운영자가 아니면 401", async () => {
    auth.admin = false;
    expect((await PATCH(req("/api/admin/brands/fields", { subject: { exhibitorId: "x" }, field: "items", value: ["스티커"] }))).status).toBe(401);
  });

  it("고치면 reviewed와 기록자가 남고, null이면 칸을 비운다", async () => {
    const { repo, graph } = await seedGraph();
    const x = graph.exhibitors[0].id;
    const res = await PATCH(req("/api/admin/brands/fields", { subject: { exhibitorId: x }, field: "items", value: ["스티커"], sources: ["https://a.example/1"] }));
    expect(res.status).toBe(200);
    expect((await res.json()).data.field).toMatchObject({ status: "reviewed", actor: "ted@example.com", sources: ["https://a.example/1"] });
    const cleared = await PATCH(req("/api/admin/brands/fields", { subject: { exhibitorId: x }, field: "items", value: null }));
    expect((await cleared.json()).data.field).toBeNull();
    expect(await repo.listProfileFields({ exhibitorIds: [x] })).toHaveLength(0);
  });

  it("모르는 칸, 틀린 값, 출처 규칙은 400, 없는 브랜드는 404", async () => {
    const { graph } = await seedGraph();
    const x = graph.exhibitors[0].id;
    const p = (body: unknown) => PATCH(req("/api/admin/brands/fields", body));
    expect((await p({ subject: { exhibitorId: x }, field: "nope", value: "a" })).status).toBe(400);
    expect((await p({ subject: { exhibitorId: x }, field: "items", value: ["아무거나"] })).status).toBe(400);
    expect((await p({ subject: { exhibitorId: x }, field: "links", value: [{ kind: "site", url: "https://a.example" }], status: "collected", sources: ["https://a.example"] })).status).toBe(400);
    expect((await p({ subject: { exhibitorId: x }, field: "whyMake", value: { summary: "계기" } })).status).toBe(400);
    expect((await p({ subject: { exhibitorId: x }, field: "items", value: ["스티커"], status: "ai_draft" })).status).toBe(400); // 워커만 쓰는 상태
    expect((await p({ subject: { exhibitorId: "nope" }, field: "items", value: ["스티커"] })).status).toBe(404);
    const ok = await p({ subject: { exhibitorId: x }, field: "links", value: [{ kind: "site", url: "https://a.example" }], status: "collected", sources: ["roam:booth/b1"] });
    expect((await ok.json()).data.field.status).toBe("collected");
  });
});

describe("검수 학습과 말투 게이트", () => {
  it("AI 초안 칸을 고치면 전과 후가 change_log에 남는다", async () => {
    const { repo, graph } = await seedGraph();
    const x = graph.exhibitors[0].id;
    await repo.upsertProfileField({ subject: { exhibitorId: x }, field: "identityLine", value: "AI가 쓴 한 줄이에요", sources: ["roam:booth/b1"], status: "ai_draft", actor: "worker:brand-profile-draft" });
    await PATCH(req("/api/admin/brands/fields", { subject: { exhibitorId: x }, field: "identityLine", value: "에디터가 고친 한 줄이에요", sources: ["roam:booth/b1"] }));
    const [c] = await repo.listChanges({ entity: "brand_profile_field" });
    expect(c).toMatchObject({ entityId: `ex:${x}:identityLine`, source: "admin", actor: "ted@example.com", reason: "AI 초안 검수" });
    expect(c.fieldDiffs.status).toEqual({ before: "ai_draft", after: "reviewed" });
    expect(c.fieldDiffs.value).toEqual({ before: "AI가 쓴 한 줄이에요", after: "에디터가 고친 한 줄이에요" });
    // 사람이 쓴 칸을 다시 고치는 건 학습 기록이 아니다.
    await PATCH(req("/api/admin/brands/fields", { subject: { exhibitorId: x }, field: "identityLine", value: "또 고친 한 줄이에요" }));
    expect(await repo.listChanges({ entity: "brand_profile_field" })).toHaveLength(1);
  });

  it("설명 문장을 사람이 고쳐도 게이트 결과를 같이 남긴다", async () => {
    const { graph } = await seedGraph();
    const x = graph.exhibitors[0].id;
    const res = await PATCH(
      req("/api/admin/brands/fields", {
        subject: { exhibitorId: x },
        field: "intro",
        value: { original: "2019년부터 키링을 만듭니다.", display: "최고의 키링을 만들어요." },
        sources: ["roam:booth/b1"],
      }),
    );
    const f = (await res.json()).data.field;
    expect(f.status).toBe("reviewed");
    expect(f.value.gate.ok).toBe(false);
    expect(f.value.gate.issues).toContain("숫자가 빠졌어요: 2019");
  });
});

describe("POST /api/admin/brands/[id]/draft", () => {
  it("잡을 넣고, 이미 대기 중이면 다시 넣지 않고, 없는 브랜드는 404", async () => {
    const { repo } = await seedGraph();
    // seedGraph는 applyExhibitorPlan만 써서 잡이 없다.
    const x = (await repo.loadExhibitorGraph()).exhibitors[0].id;
    const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
    const first = await DRAFT(req(`/api/admin/brands/${x}/draft`, {}, "POST"), ctx(x));
    expect(first.status).toBe(201);
    const second = await (await DRAFT(req(`/api/admin/brands/${x}/draft`, {}, "POST"), ctx(x))).json();
    expect(second.data.queued).toBe(false);
    expect((await DRAFT(req("/x", {}, "POST"), ctx("nope"))).status).toBe(404);
  });
});

describe("POST /api/admin/brands/links", () => {
  it("여러 줄을 한 번에 연결하거나 연결 안 함으로 둔다", async () => {
    const { repo } = await seedGraph();
    const pending = await repo.listExhibitorLinkCandidates("pending");
    expect(pending.length).toBeGreaterThanOrEqual(2);
    const [a, ...rest] = pending.map((c) => c.id);
    const r1 = await (await LINKS(req("/api/admin/brands/links", { ids: [a], decision: "approved" }, "POST"))).json();
    expect(r1.data).toMatchObject({ done: 1, skipped: 0 });
    const r2 = await (await LINKS(req("/api/admin/brands/links", { ids: [...rest, a, "nope"], decision: "rejected" }, "POST"))).json();
    // a는 이미 연결돼 건너뛰고, 없는 id도 건너뛴다. 앞의 승인으로 superseded된 후보가 있으면 그것도 건너뛴다.
    expect(r2.data.done + r2.data.skipped).toBe(rest.length + 2);
    expect(r2.data.results.find((x: { id: string }) => x.id === "nope").error).toBeTruthy();
    expect(await repo.listExhibitorLinkCandidates("pending")).toHaveLength(0);
  });

  it("빈 목록은 400, 운영자가 아니면 401", async () => {
    expect((await LINKS(req("/api/admin/brands/links", { ids: [], decision: "approved" }, "POST"))).status).toBe(400);
    auth.admin = false;
    expect((await LINKS(req("/api/admin/brands/links", { ids: ["a"], decision: "approved" }, "POST"))).status).toBe(401);
  });
});
