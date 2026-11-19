import { beforeEach, describe, expect, it, vi } from "vitest";
import { MockRepository } from "@/lib/mock/repository";
import type { NotificationLog, User } from "@/lib/types";

const state = vi.hoisted(() => ({ user: null as User | null }));
vi.mock("@/lib/api/session", () => ({ getCurrentUser: async () => state.user }));

import { GET } from "./route";
import { POST as READ } from "./read/route";
import { GET as GET_PREFS, PUT as PUT_PREFS } from "../notification-prefs/route";

const logs = () => (globalThis as unknown as { __roamStore: { notificationLogs: NotificationLog[] } }).__roamStore.notificationLogs;

describe("/api/me/notifications", () => {
  const repo = new MockRepository();
  let other: User;

  beforeEach(async () => {
    (globalThis as unknown as { __roamStore?: unknown }).__roamStore = undefined;
    state.user = await repo.createUser("알림");
    other = await repo.createUser("남");
    const payload = (exhibitorId: string, boothId?: string) => ({
      exhibitorId,
      brandName: `${exhibitorId}상점`,
      exhibitionId: "ex-1",
      slug: "newyear-store-2026",
      fairName: "새해준비상점",
      startDate: "2026-12-11",
      endDate: "2026-12-14",
      participantId: `pt-${exhibitorId}`,
      ...(boothId ? { boothId } : {}),
    });
    const rows = await repo.insertNotifications([
      { userId: state.user.id, kind: "brand_appear", title: "a상점이 새해준비상점에 나와요", body: "하트 남겨 두신 브랜드예요. 지도에서 자리를 볼 수 있어요.", payload: payload("a", "booth-a"), dedupeKey: "k1" },
      { userId: state.user.id, kind: "brand_appear", title: "b상점이 새해준비상점에 나와요", body: "하트 남겨 두신 브랜드예요.", payload: payload("b"), dedupeKey: "k2" },
      { userId: state.user.id, kind: "brand_appear", title: "c", body: "c", payload: payload("c"), dedupeKey: "k3" },
      { userId: other.id, kind: "brand_appear", title: "d", body: "d", payload: payload("d"), dedupeKey: "k4" },
    ]);
    await repo.updateNotifications([rows[0].id], { status: "sent", sentAt: new Date().toISOString() });
    await repo.updateNotifications([rows[1].id, rows[3].id], { status: "no_device" });
    // rows[2]는 queued — 알림함에 안 보인다.
    logs()[0].createdAt = "2026-11-19T01:00:00.000Z";
    logs()[1].createdAt = "2026-11-19T02:00:00.000Z";
  });

  it("로그인이 필요하다", async () => {
    state.user = null;
    expect((await GET()).status).toBe(401);
    expect((await READ(new Request("http://x", { method: "POST", body: JSON.stringify({ all: true }) }))).status).toBe(401);
  });

  it("내 줄만, 보낸 것과 기기 없는 것만, 최신순. landing은 푸시와 같은 모양", async () => {
    const { data } = await (await GET()).json();
    expect(data.unread).toBe(2);
    expect(data.items.map((i: { title: string }) => i.title)).toEqual(["b상점이 새해준비상점에 나와요", "a상점이 새해준비상점에 나와요"]);
    expect(data.items[1]).toMatchObject({
      landing: { kind: "brand", slug: "newyear-store-2026", exhibitorIds: ["a"], boothId: "booth-a" },
      brand: { exhibitorId: "a", name: "a상점" },
      fair: { slug: "newyear-store-2026", name: "새해준비상점" },
      readAt: null,
    });
    expect(data.items[0].landing).not.toHaveProperty("boothId");
  });

  it("읽음 표시: ids 또는 all, 남의 줄은 못 고친다", async () => {
    const otherId = logs().find((n) => n.userId === other.id)!.id;
    const first = logs()[0].id;
    const r1 = await READ(new Request("http://x", { method: "POST", body: JSON.stringify({ ids: [first, otherId] }) }));
    expect((await r1.json()).data.updated).toBe(1);
    expect(logs().find((n) => n.userId === other.id)!.readAt).toBeUndefined();
    const r2 = await READ(new Request("http://x", { method: "POST", body: JSON.stringify({ all: true }) }));
    expect((await r2.json()).data.updated).toBe(2); // 둘째 줄과 queued 줄
    expect((await (await GET()).json()).data.unread).toBe(0);
    expect((await READ(new Request("http://x", { method: "POST", body: JSON.stringify({}) }))).status).toBe(400);
  });

  it("알림 설정: 기본은 켜짐, 끄면 잡이 고르지 않는 목록에 들어간다", async () => {
    expect((await (await GET_PREFS()).json()).data).toEqual({ brand_appear: true });
    const put = await PUT_PREFS(new Request("http://x", { method: "PUT", body: JSON.stringify({ brand_appear: false }) }));
    expect((await put.json()).data).toEqual({ brand_appear: false });
    expect(await repo.listNotificationOptOuts("brand_appear", [state.user!.id, other.id])).toEqual([state.user!.id]);
    expect((await PUT_PREFS(new Request("http://x", { method: "PUT", body: JSON.stringify({ brand_appear: "no" }) }))).status).toBe(400);
  });
});
