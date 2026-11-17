import { beforeEach, describe, expect, it } from "vitest";
import { MockRepository } from "@/lib/mock/repository";
import { planFromRepository } from "@/lib/exhibitor/service";
import { planContactAction, type ContactView } from "./contact-actions";
import { getOutreachStore, subjectsFromGraph, READ_ONLY_REASON, type ContactSubject } from "./outreach-store";
import type { ContactAction } from "@/lib/schemas";
import type { ExhibitorGraph } from "@/lib/types";

/** STEP 1 전 운영처럼 목표 테이블이 없는 저장소. */
class BoothOnlyRepository extends MockRepository {
  async hasParticipantOutreach() {
    return false;
  }
}

beforeEach(() => {
  (globalThis as unknown as { __roamStore?: unknown }).__roamStore = undefined;
});

const T = "2026-11-17";

/** 부스 있는 출전 하나와, 같은 박람회에 부스 없는 출전(브랜드 먼저 인입) 하나. */
async function setup(repo: MockRepository) {
  const { plan } = await planFromRepository(repo);
  await repo.applyExhibitorPlan(plan);
  const store = (globalThis as unknown as { __roamStore: { exhibitorGraph: ExhibitorGraph } }).__roamStore;
  const graph = store.exhibitorGraph;
  const withBooth = subjectsFromGraph(graph).find((s) => s.boothId)!;
  graph.exhibitors.push({ id: "ex_new", canonicalName: "새 브랜드" });
  graph.participants.push({ id: "pt_new", exhibitorId: "ex_new", exhibitionId: withBooth.exhibitionId, displayName: "새 브랜드" });
  const boothless = subjectsFromGraph(graph, ["pt_new"])[0];
  return { withBooth, boothless };
}

async function run(repo: MockRepository, s: ContactSubject, action: ContactAction, handle?: string) {
  const store = await getOutreachStore(repo);
  const prev = (await store.read([s])).get(s.participantId)!;
  const plan = planContactAction(prev.view, action, { today: T, handle, logs: prev.logs });
  if (!plan.ok) return { ok: false as const, reason: plan.reason };
  return store.apply(s, plan, "ted@roam");
}

describe("연락 저장 길목 — 목표 모양(브랜드 연락처 + 출전 허락)", () => {
  it("부스 없는 출전도 보냄으로 표시하고, 계정은 브랜드에, 상태는 출전에, 기록은 브랜드 VOC에", async () => {
    const repo = new MockRepository();
    const { boothless } = await setup(repo);
    expect(boothless.boothId).toBeNull();
    const r = await run(repo, boothless, { type: "mark-sent" }, "@new_brand");
    expect(r.ok).toBe(true);
    expect(await repo.listParticipantPermissions(boothless.exhibitionId)).toMatchObject([
      { participantId: "pt_new", status: "sent", sentAt: T, checklist: { "dm-sent": expect.any(String) }, updatedBy: "ted@roam" },
    ]);
    expect(await repo.listBrandOutreach(["ex_new"])).toMatchObject([{ handle: "@new_brand", channel: "instagram", doNotContact: false }]);
    expect(await repo.listBrandOutreachLogs(["ex_new"])).toMatchObject([
      { participantId: "pt_new", direction: "outbound", summary: "보냄으로 표시", actor: "ted@roam" },
    ]);
    // 옛 부스 키에는 아무것도 안 쓴다
    expect(await repo.listBrandContacts()).toHaveLength(0);
  });

  it("연락 금지는 브랜드에 걸려 다른 출전의 보냄도 막는다", async () => {
    const repo = new MockRepository();
    const { boothless } = await setup(repo);
    expect((await run(repo, boothless, { type: "set-do-not-contact", on: true })).ok).toBe(true);
    const r = await run(repo, boothless, { type: "mark-sent" });
    expect(r).toEqual({ ok: false, reason: "연락하지 않기로 한 브랜드예요" });
  });

  it("브랜드 VOC 중 다른 출전 이야기는 이 줄에 안 섞인다(브랜드 전체 이야기는 보인다)", async () => {
    const repo = new MockRepository();
    const { boothless } = await setup(repo);
    const graph = (globalThis as unknown as { __roamStore: { exhibitorGraph: ExhibitorGraph } }).__roamStore.exhibitorGraph;
    graph.participants.push({ id: "pt_other", exhibitorId: "ex_new", exhibitionId: "exh_other", displayName: "새 브랜드" });
    await repo.addBrandOutreachLog({ exhibitorId: "ex_new", participantId: "pt_other", direction: "inbound", kind: "message", summary: "다른 회차" }, null);
    await repo.addBrandOutreachLog({ exhibitorId: "ex_new", direction: "internal", kind: "other", summary: "브랜드 전체" }, null);
    const st = (await (await getOutreachStore(repo)).read([boothless])).get("pt_new")!;
    expect(st.logs.map((l) => l.summary)).toEqual(["브랜드 전체"]);
    await expect(
      repo.addBrandOutreachLog({ exhibitorId: "ex_new", participantId: "nope", direction: "inbound", kind: "message", summary: "x" }, null),
    ).rejects.toThrow();
  });
});

describe("연락 저장 길목 — 옛 부스 키로 돌아갈 때(STEP 1 전 운영)", () => {
  it("부스 있는 출전은 brand_contact에 쓰고 기록을 남긴다", async () => {
    const repo = new BoothOnlyRepository();
    const { withBooth } = await setup(repo);
    const store = await getOutreachStore(repo);
    expect(store.mode).toBe("booth");
    const r = await run(repo, withBooth, { type: "mark-sent" }, "@a");
    expect(r.ok).toBe(true);
    expect(await repo.getBrandContact(withBooth.boothId!)).toMatchObject({ status: "sent", handle: "@a", sentAt: T });
    expect(await repo.listBrandContactLogs(withBooth.boothId!)).toMatchObject([{ summary: "보냄으로 표시" }]);
    const view: ContactView = (await store.read([withBooth])).get(withBooth.participantId)!.view;
    expect(view).toMatchObject({ status: "sent", handle: "@a", doNotContact: false });
  });

  it("부스 없는 출전은 읽기만 되고, 연락 금지는 저장하지 않는다", async () => {
    const repo = new BoothOnlyRepository();
    const { withBooth, boothless } = await setup(repo);
    const store = await getOutreachStore(repo);
    expect((await store.read([boothless])).get("pt_new")).toMatchObject({ writable: false, saved: false });
    expect(await run(repo, boothless, { type: "mark-sent" })).toEqual({ ok: false, reason: READ_ONLY_REASON });
    const r = await run(repo, withBooth, { type: "set-do-not-contact", on: true });
    expect(r.ok).toBe(false);
  });
});
