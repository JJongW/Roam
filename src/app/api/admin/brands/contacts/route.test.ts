import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ admin: true }));
vi.mock("@/lib/api/http", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/api/http")>();
  return {
    ...mod,
    requireAdmin: async () => (auth.admin ? null : mod.fail("UNAUTHORIZED", "운영자 인증이 필요합니다")),
    getAdminActor: async () => "ted@example.com",
  };
});

import { GET as LIST } from "./route";
import { GET, PATCH } from "./[boothId]/route";
import { POST as LOG } from "./[boothId]/logs/route";

beforeEach(() => {
  (globalThis as unknown as { __roamStore?: unknown }).__roamStore = undefined;
  auth.admin = true;
});

const ctx = (boothId: string) => ({ params: Promise.resolve({ boothId }) });
const json = (method: string, body: unknown) =>
  new Request("http://localhost/x", { method, body: JSON.stringify(body), headers: { "content-type": "application/json" } });

describe("/api/admin/brands/contacts", () => {
  it("운영자가 아니면 읽기도 쓰기도 401", async () => {
    auth.admin = false;
    expect((await LIST(new Request("http://localhost/api/admin/brands/contacts"))).status).toBe(401);
    expect((await GET(new Request("http://localhost/x"), ctx("b_a1902"))).status).toBe(401);
    expect((await PATCH(json("PATCH", { status: "sent" }), ctx("b_a1902"))).status).toBe(401);
    expect((await LOG(json("POST", { direction: "outbound", kind: "message", summary: "x" }), ctx("b_a1902"))).status).toBe(401);
  });

  it("저장 전엔 빈 컨택을 주고, PATCH 뒤엔 저장된 값과 기록자를 준다", async () => {
    const before = await (await GET(new Request("http://localhost/x"), ctx("b_a1902"))).json();
    expect(before.data).toMatchObject({ saved: false, contact: { status: "not-sent" }, logs: [] });

    const res = await PATCH(json("PATCH", { status: "sent", sentAt: "2026-11-05", checklist: { "dm-sent": true } }), ctx("b_a1902"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.contact).toMatchObject({ status: "sent", sentAt: "2026-11-05", updatedBy: "ted@example.com" });
    expect(body.data.contact.checklist["dm-sent"]).toBeTruthy();

    const list = await (await LIST(new Request("http://localhost/api/admin/brands/contacts?exhibitionId=exh_sibf_2026"))).json();
    expect(list.data.contacts).toHaveLength(1);
  });

  it("잘못된 입력은 400, 없는 부스는 404", async () => {
    expect((await PATCH(json("PATCH", { status: "maybe" }), ctx("b_a1902"))).status).toBe(400);
    expect((await PATCH(json("PATCH", { status: "sent" }), ctx("nope"))).status).toBe(404);
    expect((await GET(new Request("http://localhost/x"), ctx("nope"))).status).toBe(404);
    expect((await LOG(json("POST", { direction: "outbound", kind: "message", summary: "" }), ctx("b_a1902"))).status).toBe(400);
  });

  it("VOC 로그를 남기면 201, 상세에 최근 것부터 나온다", async () => {
    const res = await LOG(json("POST", { direction: "inbound", kind: "edit-request", channel: "instagram", summary: "가격은 빼 달라고 하심" }), ctx("b_a1902"));
    expect(res.status).toBe(201);
    expect((await res.json()).data.log).toMatchObject({ kind: "edit-request", actor: "ted@example.com" });
    const detail = await (await GET(new Request("http://localhost/x"), ctx("b_a1902"))).json();
    expect(detail.data.saved).toBe(true);
    expect(detail.data.logs).toHaveLength(1);
  });
});
