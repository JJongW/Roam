import { beforeEach, describe, expect, it } from "vitest";
import { MockRepository } from "@/lib/mock/repository";
import { exhibitionInputSchema } from "@/lib/schemas";
import type { Booth, BrandHeart, NotificationLog, PushDevice } from "@/lib/types";
import type { PushMessage, PushResult, PushSender, PushTarget } from "./apns";
import { BRAND_APPEAR_JOB, runBrandAppear } from "./run-brand-appear";

interface Graph {
  exhibitors: { id: string; canonicalName: string }[];
  participants: { id: string; exhibitorId: string; exhibitionId: string; displayName: string; createdAt?: string }[];
  assignments: { boothId: string; participantId: string; role: "primary" | "co_exhibitor" }[];
}
interface Store {
  exhibitorGraph: Graph;
  booths: Booth[];
  brandHearts: BrandHeart[];
  pushDevices: PushDevice[];
  notificationLogs: NotificationLog[];
  jobCursors: Record<string, string>;
}
const st = () => (globalThis as unknown as { __roamStore: Store }).__roamStore;

/** 받은 요청을 적어 두는 가짜 보내기. 토큰 이름으로 응답을 정한다. */
function fakeSender(): PushSender & { sent: { target: PushTarget; msg: PushMessage }[] } {
  const sent: { target: PushTarget; msg: PushMessage }[] = [];
  return {
    sent,
    async send(target, msg): Promise<PushResult> {
      sent.push({ target, msg });
      if (target.token.startsWith("dead")) return { ok: false, status: 410, reason: "Unregistered", tokenDead: true, retryable: false };
      if (target.token.startsWith("bad")) return { ok: false, status: 400, reason: "BadDeviceToken", tokenDead: true, retryable: false };
      if (target.token.startsWith("busy")) return { ok: false, status: 503, reason: "ServiceUnavailable", tokenDead: false, retryable: true };
      return { ok: true, status: 200 };
    },
    close() {},
  };
}

// 한국 11-19 11:00(보내는 시간), 23:00(조용한 시간)
const DAY = new Date("2026-11-19T02:00:00Z");
const NIGHT = new Date("2026-11-19T14:00:00Z");
const NEXT_DAY = new Date("2026-11-20T02:00:00Z");
const BEFORE = "2026-11-18T00:00:00.000Z";

describe("브랜드 알림 잡", () => {
  const repo = new MockRepository();
  let fairId: string;
  let u1: string;
  let u2: string;

  async function addParticipation(exhibitorId: string, name: string, opts: { createdAt?: string; booth?: boolean; fair?: string } = {}) {
    const g = st().exhibitorGraph;
    if (!g.exhibitors.some((e) => e.id === exhibitorId)) g.exhibitors.push({ id: exhibitorId, canonicalName: name });
    const pid = `pt-${exhibitorId}-${opts.fair ?? fairId}`;
    g.participants.push({ id: pid, exhibitorId, exhibitionId: opts.fair ?? fairId, displayName: name, createdAt: opts.createdAt ?? "2026-11-19T01:00:00.000Z" });
    if (opts.booth) {
      st().booths.push({ id: `booth-${exhibitorId}`, name, code: "A1", exhibitionId: opts.fair ?? fairId } as Booth);
      g.assignments.push({ boothId: `booth-${exhibitorId}`, participantId: pid, role: "primary" });
    }
  }
  const heart = (userId: string, exhibitorId: string, createdAt = "2026-11-01T00:00:00.000Z") =>
    st().brandHearts.push({ userId, exhibitorId, createdAt });
  const device = (userId: string, token: string) =>
    repo.upsertPushDevice({ token, environment: "production", userId });
  const logs = () => st().notificationLogs;

  beforeEach(async () => {
    (globalThis as unknown as { __roamStore?: unknown }).__roamStore = undefined;
    const ex = await repo.createExhibition(
      exhibitionInputSchema.parse({ slug: "newyear-store-2026", name: "새해준비상점", venue: "코엑스", startDate: "2026-12-11", endDate: "2026-12-14" }),
    );
    fairId = ex.id;
    u1 = (await repo.createUser("하나")).id;
    u2 = (await repo.createUser("둘")).id;
    await repo.setJobCursor(BRAND_APPEAR_JOB, BEFORE);
  });

  it("하나면 그 부스로 보내고, 다시 돌려도 같은 사람에게 같은 브랜드와 박람회를 알리지 않는다", async () => {
    await addParticipation("ex-a", "모모상점", { booth: true });
    heart(u1, "ex-a");
    await device(u1, "tok-1");
    const sender = fakeSender();

    const r1 = await runBrandAppear(repo, { now: DAY, sender });
    expect(r1.match.inserted).toBe(1);
    expect(r1.deliver.sentUsers).toBe(1);
    expect(sender.sent).toHaveLength(1);
    expect(sender.sent[0].msg.body).toEqual({
      aps: { alert: { title: "모모상점이 새해준비상점에 나와요", body: "하트 남겨 두신 브랜드예요. 지도에서 자리를 볼 수 있어요." }, sound: "default" },
      kind: "brand",
      slug: "newyear-store-2026",
      exhibitorIds: ["ex-a"],
      boothId: "booth-ex-a",
    });
    expect(logs()[0]).toMatchObject({ status: "sent", dedupeKey: `brand_appear:${u1}:ex-a:${fairId}` });
    expect(logs()[0].batchId).toBeTruthy();
    expect(st().jobCursors[BRAND_APPEAR_JOB]).toBe(DAY.toISOString());

    // 기준 시각을 되돌려 같은 참가를 다시 잡아도 dedupe_key로 빠진다.
    await repo.setJobCursor(BRAND_APPEAR_JOB, BEFORE);
    const r2 = await runBrandAppear(repo, { now: NEXT_DAY, sender });
    expect(r2.match).toMatchObject({ candidates: 1, inserted: 0, duplicate: 1 });
    expect(sender.sent).toHaveLength(1);
    expect(logs()).toHaveLength(1);
  });

  it("같은 날 여럿은 사용자마다 목록 푸시 하나로 묶는다", async () => {
    await addParticipation("ex-a", "모모상점", { booth: true });
    await addParticipation("ex-b", "오브제하우스");
    await addParticipation("ex-c", "종이가게");
    for (const e of ["ex-a", "ex-b", "ex-c"]) heart(u1, e);
    heart(u2, "ex-b");
    await device(u1, "tok-1");
    await device(u1, "tok-1b"); // 기기 둘
    await device(u2, "tok-2");
    const sender = fakeSender();

    const r = await runBrandAppear(repo, { now: DAY, sender });
    expect(r.deliver).toMatchObject({ sentUsers: 2, sentRows: 4 });
    const toU1 = sender.sent.filter((s) => s.target.token.startsWith("tok-1"));
    expect(toU1).toHaveLength(2);
    expect(toU1[0].msg.body).toMatchObject({
      aps: { alert: { title: "하트 남긴 브랜드 3곳이 새해준비상점에 나와요" } },
      kind: "brand",
      slug: "newyear-store-2026",
      exhibitorIds: ["ex-a", "ex-b", "ex-c"],
    });
    expect(toU1[0].msg.body).not.toHaveProperty("boothId");
    const u1Rows = logs().filter((n) => n.userId === u1);
    expect(new Set(u1Rows.map((n) => n.batchId)).size).toBe(1);
    // u2는 하나 → 부스 없는 브랜드라 지도 문장이 없다.
    const toU2 = sender.sent.find((s) => s.target.token === "tok-2")!;
    expect(toU2.msg.body).toMatchObject({ aps: { alert: { title: "오브제하우스가 새해준비상점에 나와요", body: "하트 남겨 두신 브랜드예요." } }, exhibitorIds: ["ex-b"] });
  });

  it("조용한 시간엔 줄만 쌓고, 보내는 시간이 되면 보낸다", async () => {
    await addParticipation("ex-a", "모모상점");
    heart(u1, "ex-a");
    await device(u1, "tok-1");
    const sender = fakeSender();

    const night = await runBrandAppear(repo, { now: NIGHT, sender });
    expect(night.inWindow).toBe(false);
    expect(night.deliver).toMatchObject({ heldRows: 1, sentUsers: 0 });
    expect(sender.sent).toHaveLength(0);
    expect(logs()[0].status).toBe("queued");
    expect(await repo.listNotifications(u1, BEFORE)).toHaveLength(0); // 알림함엔 아직 안 보인다

    const morning = await runBrandAppear(repo, { now: NEXT_DAY, sender });
    expect(morning.match.inserted).toBe(0);
    expect(morning.deliver.sentUsers).toBe(1);
    expect(logs()[0].status).toBe("sent");
    expect(await repo.listNotifications(u1, BEFORE)).toHaveLength(1);
  });

  it("오늘 이미 받은 사람은 내일로 남긴다(하루 한 번)", async () => {
    await addParticipation("ex-a", "모모상점");
    heart(u1, "ex-a");
    await device(u1, "tok-1");
    const sender = fakeSender();
    await runBrandAppear(repo, { now: DAY, sender });

    await addParticipation("ex-b", "오브제하우스", { createdAt: "2026-11-19T03:00:00.000Z" });
    heart(u1, "ex-b");
    const later = await runBrandAppear(repo, { now: new Date("2026-11-19T05:00:00Z"), sender });
    expect(later.deliver).toMatchObject({ heldRows: 1, sentUsers: 0 });
    expect(sender.sent).toHaveLength(1);

    const next = await runBrandAppear(repo, { now: NEXT_DAY, sender });
    expect(next.deliver.sentUsers).toBe(1);
    expect(sender.sent).toHaveLength(2);
  });

  it("기기가 없어도 알림함 줄은 남긴다(no_device)", async () => {
    await addParticipation("ex-a", "모모상점");
    heart(u1, "ex-a");
    const r = await runBrandAppear(repo, { now: DAY, sender: fakeSender() });
    expect(r.deliver.noDeviceRows).toBe(1);
    expect(logs()[0].status).toBe("no_device");
    const inbox = await repo.listNotifications(u1, BEFORE);
    expect(inbox.map((n) => n.title)).toEqual(["모모상점이 새해준비상점에 나와요"]);
  });

  it("410과 BadDeviceToken 토큰은 끊고, 살아 있는 기기로는 보낸다", async () => {
    await addParticipation("ex-a", "모모상점");
    heart(u1, "ex-a");
    heart(u2, "ex-a");
    await device(u1, "dead-1");
    await device(u1, "tok-1");
    await device(u2, "bad-2");
    const r = await runBrandAppear(repo, { now: DAY, sender: fakeSender() });
    expect(r.deliver.revokedTokens).toBe(2);
    const byToken = Object.fromEntries(st().pushDevices.map((d) => [d.token, !!d.revokedAt]));
    expect(byToken).toEqual({ "dead-1": true, "tok-1": false, "bad-2": true });
    expect(logs().find((n) => n.userId === u1)?.status).toBe("sent");
    expect(logs().find((n) => n.userId === u2)?.status).toBe("no_device");
    // 다음 번엔 끊긴 토큰을 고르지 않는다.
    expect((await repo.listActivePushDevices([u1, u2])).map((d) => d.token)).toEqual(["tok-1"]);
  });

  it("일시 실패(5xx)는 queued로 남겨 다음 번에 다시 보낸다", async () => {
    await addParticipation("ex-a", "모모상점");
    heart(u1, "ex-a");
    await device(u1, "busy-1");
    const r = await runBrandAppear(repo, { now: DAY, sender: fakeSender() });
    expect(r.deliver.heldRows).toBe(1);
    expect(logs()[0]).toMatchObject({ status: "queued", error: "ServiceUnavailable" });
  });

  it("알림을 끈 사람과 참가가 생긴 뒤 하트를 남긴 사람은 고르지 않는다", async () => {
    await addParticipation("ex-a", "모모상점");
    heart(u1, "ex-a");
    heart(u2, "ex-a", "2026-11-19T01:30:00.000Z");
    await repo.setNotificationPref(u1, "brand_appear", false);
    const r = await runBrandAppear(repo, { now: DAY, sender: fakeSender() });
    expect(r.match).toMatchObject({ candidates: 0, skipped: { opted_out: 1, hearted_after: 1 } });
    expect(logs()).toHaveLength(0);
  });

  it("보내기 전에 박람회가 끝나면 expired", async () => {
    await addParticipation("ex-a", "모모상점");
    heart(u1, "ex-a");
    await device(u1, "tok-1");
    await runBrandAppear(repo, { now: NIGHT, sender: fakeSender() });
    const sender = fakeSender();
    const r = await runBrandAppear(repo, { now: new Date("2026-12-15T02:00:00Z"), sender });
    expect(r.deliver.expiredRows).toBe(1);
    expect(sender.sent).toHaveLength(0);
    expect(logs()[0].status).toBe("expired");
  });

  it("APNs가 없으면 고르기만 하고 queued로 둔다", async () => {
    await addParticipation("ex-a", "모모상점");
    heart(u1, "ex-a");
    await device(u1, "tok-1");
    const r = await runBrandAppear(repo, { now: DAY, sender: null });
    expect(r.deliver).toMatchObject({ heldRows: 1, heldReason: "APNs 미설정" });
    expect(logs()[0].status).toBe("queued");
  });

  it("드라이런은 아무것도 쓰지 않는다", async () => {
    await addParticipation("ex-a", "모모상점");
    heart(u1, "ex-a");
    await device(u1, "tok-1");
    const r = await runBrandAppear(repo, { now: DAY, dryRun: true, sender: fakeSender() });
    expect(r.preview.map((n) => n.title)).toEqual(["모모상점이 새해준비상점에 나와요"]);
    expect(r.deliver.planned).toHaveLength(1);
    expect(r.deliver.planned[0].push.data).toEqual({ kind: "brand", slug: "newyear-store-2026", exhibitorIds: ["ex-a"] });
    expect(logs()).toHaveLength(0);
    expect(st().jobCursors[BRAND_APPEAR_JOB]).toBe(BEFORE);
  });

  it("끝난 박람회의 새 참가와 기준 시각 전 참가는 보지 않는다", async () => {
    const old = await repo.createExhibition(
      exhibitionInputSchema.parse({ slug: "old-fair", name: "지난 페어", venue: "코엑스", startDate: "2026-10-01", endDate: "2026-10-03" }),
    );
    await addParticipation("ex-a", "모모상점", { fair: old.id });
    await addParticipation("ex-b", "오브제하우스", { createdAt: "2026-11-17T00:00:00.000Z" });
    heart(u1, "ex-a");
    heart(u1, "ex-b");
    const r = await runBrandAppear(repo, { now: DAY, sender: fakeSender() });
    expect(r.match.participations).toBe(0);
  });
});
