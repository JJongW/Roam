import { beforeEach, describe, expect, it } from "vitest";
import { MockRepository } from "./repository";

beforeEach(() => {
  (globalThis as unknown as { __roamStore?: unknown }).__roamStore = undefined;
});

describe("MockRepository 브랜드 컨택(0061)", () => {
  const repo = new MockRepository();

  it("없는 부스면 null, 처음 저장하면 부스의 박람회로 행을 만든다", async () => {
    expect(await repo.upsertBrandContact("nope", { status: "sent" }, null)).toBeNull();
    const c = await repo.upsertBrandContact("b_a1902", { status: "sent", channel: "instagram", handle: "@a" }, "ted");
    expect(c).toMatchObject({ boothId: "b_a1902", exhibitionId: "exh_sibf_2026", status: "sent", updatedBy: "ted" });
    expect(await repo.listBrandContacts({ exhibitionId: "exh_sibf_2026" })).toHaveLength(1);
    expect(await repo.listBrandContacts({ exhibitionId: "exh_sif_2026" })).toHaveLength(0);
  });

  it("부분 수정은 보낸 키만 바꾸고 체크리스트 완료 시각을 지킨다", async () => {
    await repo.upsertBrandContact("b_a1902", { handle: "@a", checklist: { "dm-sent": true } }, null);
    const first = (await repo.getBrandContact("b_a1902"))!.checklist["dm-sent"];
    await new Promise((r) => setTimeout(r, 5));
    const c = await repo.upsertBrandContact("b_a1902", { status: "granted", checklist: { "dm-sent": true, "image-received": true } }, null);
    expect(c!.handle).toBe("@a");
    expect(c!.checklist["dm-sent"]).toBe(first);
    expect(Object.keys(c!.checklist)).toEqual(["dm-sent", "image-received"]);
  });

  it("로그를 남기면 컨택 행이 없어도 먼저 만들고, 최근 것부터 돌려준다", async () => {
    expect(await repo.addBrandContactLog("nope", { direction: "outbound", kind: "message", summary: "x" }, null)).toBeNull();
    await repo.addBrandContactLog("b_b601", { direction: "outbound", kind: "message", summary: "DM 보냄", occurredAt: "2026-11-03T10:00:00+09:00" }, "ted");
    await repo.addBrandContactLog("b_b601", { direction: "inbound", kind: "takedown-request", summary: "내려 달라고 하심", occurredAt: "2026-11-05T10:00:00+09:00" }, "ted");
    expect((await repo.getBrandContact("b_b601"))!.status).toBe("not-sent");
    const logs = await repo.listBrandContactLogs("b_b601");
    expect(logs.map((l) => l.kind)).toEqual(["takedown-request", "message"]);
    expect(logs[0].occurredAt).toBe("2026-11-05T01:00:00.000Z");
  });
});
