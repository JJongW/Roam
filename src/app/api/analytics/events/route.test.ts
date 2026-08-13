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
});
