import { beforeEach, describe, expect, it, vi } from "vitest";
import { getRepository } from "@/lib/repositories";
import { MockRepository } from "@/lib/mock/repository";

const state = vi.hoisted(() => ({
  nextSessionId: "test-session-1",
}));

// Mock ensureSession to avoid cookies API outside request scope
vi.mock("@/lib/api/session", () => ({
  ensureSession: async (exhibitionId?: string) => {
    const repo = await getRepository();
    let session = await repo.getSession(state.nextSessionId);
    if (!session) {
      session = await repo.createSession(exhibitionId ?? "unknown");
      state.nextSessionId = session.id;
    }
    return session;
  },
  getCurrentUser: vi.fn(),
}));

// getUserId도 cookies()를 쓴다 — 나머지(parseBody 등)는 원본 유지.
vi.mock("@/lib/api/http", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/http")>()),
  getUserId: async () => "u_test",
}));

import { POST } from "./route";

beforeEach(() => {
  (globalThis as unknown as { __roamStore?: unknown }).__roamStore = undefined;
  state.nextSessionId =
    "test-session-" + Math.random().toString(36).substring(7);
});

describe("POST /api/analytics/events", () => {
  it("attributes a booth-less ui_click event via exhibitionSlug", async () => {
    const repo = await getRepository();
    expect(repo).toBeInstanceOf(MockRepository);

    const req = new Request("http://localhost/api/analytics/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "ui_click",
        exhibitionSlug: "sibf-2026",
        meta: { control: "map_zoom_in" },
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(202);

    const detail = await repo.getExhibition("sibf-2026");
    const events = await repo._allAnalytics!(detail!.exhibition.id);
    const clicks = events.filter((e) => e.type === "ui_click");
    expect(clicks.length).toBe(1);
    expect(clicks[0].meta?.control).toBe("map_zoom_in");
    expect(clicks[0].userId).toBe("u_test");
  });

  it("attributes a booth-less ui_click event via a direct exhibitionId (no slug lookup)", async () => {
    const repo = await getRepository();
    // slug→id 조회 자체가 일어나지 않아야 한다 — exhibitionId가 곧 최종 값이다.
    const spy = vi.spyOn(repo, "getExhibitionIdBySlug");
    const exhibitionId = (await repo.getExhibition("sibf-2026"))!.exhibition.id;

    const req = new Request("http://localhost/api/analytics/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "ui_click",
        exhibitionId,
        meta: { control: "companion_bar_open" },
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(202);
    expect(spy).not.toHaveBeenCalled();

    const events = await repo._allAnalytics!(exhibitionId);
    const clicks = events.filter((e) => e.type === "ui_click");
    expect(clicks.length).toBe(1);
    expect(clicks[0].meta?.control).toBe("companion_bar_open");
    spy.mockRestore();
  });

  it("still attributes booth-scoped events via boothId (unchanged behavior)", async () => {
    const req = new Request("http://localhost/api/analytics/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "view", boothId: "b_a1902" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(202);

    const repo = await getRepository();
    const booth = await repo.getBooth("b_a1902");
    const events = await repo._allAnalytics!(booth!.exhibitionId);
    expect(
      events.some((e) => e.type === "view" && e.boothId === "b_a1902"),
    ).toBe(true);
  });

  describe("앱 이벤트 묶음 (iOS, 0066)", () => {
    const ANON = "0b7f2a7e-3c1d-4c55-9a51-3a3f4a0f9d11";
    function batch(events: unknown[], extra: Record<string, unknown> = {}) {
      return new Request("http://localhost/api/analytics/events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ platform: "ios", appVersion: "2.0.0", anonId: ANON, sessionId: "s1", events, ...extra }),
      });
    }
    function ev(id: string, p: Record<string, unknown> = {}) {
      return { eventId: id, name: "heart_add", clientTs: "2026-11-17T10:00:00+09:00", screenId: "UI 4-01", ...p };
    }
    const all = () =>
      (globalThis as unknown as { __roamStore: { analytics: import("@/lib/types").AnalyticsEvent[] } }).__roamStore.analytics.filter(
        (a) => a.type === "app",
      );

    it("박람회 없는 이벤트도 받고, 같은 eventId는 한 번만 남긴다", async () => {
      await getRepository();
      const id = "6a3c5a7e-1111-4c55-9a51-3a3f4a0f9d11";
      const res = await POST(batch([ev(id, { name: "app_open" }), ev(id, { name: "app_open" })]));
      expect(res.status).toBe(202);
      await POST(batch([ev(id, { name: "app_open" })])); // 재전송
      const rows = all();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ name: "app_open", platform: "ios", anonId: ANON, appSessionId: "s1", screenId: "UI 4-01", exhibitionId: "" });
    });

    it("부스로 박람회를 찾아 붙이고, 없는 부스 id는 버린다", async () => {
      await POST(
        batch([
          ev("6a3c5a7e-2222-4c55-9a51-3a3f4a0f9d11", { boothId: "b_a1902" }),
          ev("6a3c5a7e-3333-4c55-9a51-3a3f4a0f9d11", { boothId: "nope" }),
        ]),
      );
      const repo = await getRepository();
      const booth = await repo.getBooth("b_a1902");
      const rows = all();
      expect(rows.find((r) => r.boothId === "b_a1902")?.exhibitionId).toBe(booth!.exhibitionId);
      expect(rows.some((r) => r.boothId === "nope")).toBe(false);
    });

    it("위치, 메모, 긴 글은 속성에서 지운다", async () => {
      await POST(
        batch([
          ev("6a3c5a7e-4444-4c55-9a51-3a3f4a0f9d11", {
            name: "memo_save",
            props: { len_bucket: "11-50", memo: "비밀", lat: 37.5, user_lng: 127, source: "detail", note: "x".repeat(120) },
          }),
        ]),
      );
      expect(all()[0].meta).toEqual({ len_bucket: "11-50", source: "detail" });
    });

    it("anonId가 uuid가 아니거나 이름이 규칙 밖이면 400", async () => {
      expect((await POST(batch([ev("6a3c5a7e-5555-4c55-9a51-3a3f4a0f9d11")], { anonId: "x" }))).status).toBe(400);
      expect((await POST(batch([ev("6a3c5a7e-6666-4c55-9a51-3a3f4a0f9d11", { name: "Heart Add" })]))).status).toBe(400);
    });
  });
});
