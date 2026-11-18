import { beforeEach, describe, expect, it } from "vitest";
import { MockRepository } from "@/lib/mock/repository";
import { checkPublishPermissions, loadPublishGate, type GateData } from "./permission-gate";
import type { ExhibitorGraph, ParticipantPermission } from "@/lib/types";

const perm = (participantId: string, o: Partial<ParticipantPermission> = {}): ParticipantPermission => ({
  participantId,
  exhibitionId: "e1",
  status: "granted",
  sentAt: "2026-11-03",
  reply: null,
  allowedUse: ["sent-photo"],
  photoSource: null,
  textSource: null,
  notes: null,
  checklist: {},
  updatedBy: "ted",
  createdAt: "",
  updatedAt: "",
  ...o,
});

function data(o: Partial<GateData> = {}): GateData {
  return {
    participants: new Map([
      ["p1", { exhibitorId: "x1", displayName: "별빛다움" }],
      ["p2", { exhibitorId: "x2", displayName: "마녀공방" }],
    ]),
    permissions: new Map([["p1", perm("p1")]]),
    outreach: new Map(),
    logs: [],
    ...o,
  };
}

describe("게시 전 허락 문", () => {
  it("허락과 맞는 용도가 있으면 통과해요(사진은 계정 사진이나 보내 준 사진 어느 쪽이든)", () => {
    expect(checkPublishPermissions([{ participantId: "p1", uses: ["photo"] }], data())).toEqual([]);
    const partial = data({ permissions: new Map([["p1", perm("p1", { status: "partial", allowedUse: ["account-photo", "tag"] })]]) });
    expect(checkPublishPermissions([{ participantId: "p1", uses: ["photo", "tag"] }], partial)).toEqual([]);
  });

  it("허락 기록이 없거나 허락 전이면 막아요", () => {
    expect(checkPublishPermissions([{ participantId: "p2", uses: ["photo"] }], data())).toEqual([
      "마녀공방: 허락 기록이 없어요. 허락을 받고 연락 보드에 남긴 뒤 게시해 주세요",
    ]);
    const sent = data({ permissions: new Map([["p1", perm("p1", { status: "sent" })]]) });
    expect(checkPublishPermissions([{ participantId: "p1", uses: ["photo"] }], sent)[0]).toBe("별빛다움: 아직 허락을 받지 않았어요(지금 상태: 보냄)");
    const declined = data({ permissions: new Map([["p1", perm("p1", { status: "declined" })]]) });
    expect(checkPublishPermissions([{ participantId: "p1", uses: ["photo"] }], declined)[0]).toContain("거절");
  });

  it("쓰려는 용도가 허락 범위에 없거나 허락 범위가 비면 막아요", () => {
    expect(checkPublishPermissions([{ participantId: "p1", uses: ["photo", "tag"] }], data())).toEqual([
      "별빛다움: 허락 범위에 없는 용도가 있어요(계정 표기)",
    ]);
    const empty = data({ permissions: new Map([["p1", perm("p1", { allowedUse: [] })]]) });
    expect(checkPublishPermissions([{ participantId: "p1", uses: ["photo"] }], empty)[0]).toContain("허락 범위가 비어 있어요");
  });

  it("연락 금지, 내려 달라는 요청, 철회는 허락이 있어도 막아요", () => {
    const dnc = data({ outreach: new Map([["x1", { exhibitorId: "x1", channel: null, handle: null, doNotContact: true, notes: null, updatedBy: null, createdAt: "", updatedAt: "" }]]) });
    expect(checkPublishPermissions([{ participantId: "p1", uses: ["photo"] }], dnc)).toEqual(["별빛다움: 연락하지 않기로 한 브랜드라 게시할 수 없어요"]);
    const takedown = data({
      logs: [{ id: "l1", exhibitorId: "x1", participantId: null, direction: "inbound", kind: "takedown-request", channel: "instagram", summary: "내려 주세요", actor: "ted", occurredAt: "", createdAt: "" }],
    });
    expect(checkPublishPermissions([{ participantId: "p1", uses: ["photo"] }], takedown)).toEqual(["별빛다움: 내려 달라는 요청을 받은 브랜드라 게시할 수 없어요"]);
    const withdrawn = data({ permissions: new Map([["p1", perm("p1", { status: "withdrawn" })]]) });
    expect(checkPublishPermissions([{ participantId: "p1", uses: ["photo"] }], withdrawn)).toEqual(["별빛다움: 허락을 철회한 브랜드라 게시할 수 없어요"]);
  });

  it("게시 전 확인을 원한 브랜드는 '게시 전 공유'가 켜져야 넘어가요", () => {
    const want = data({ permissions: new Map([["p1", perm("p1", { allowedUse: ["sent-photo", "preview"] })]]) });
    expect(checkPublishPermissions([{ participantId: "p1", uses: ["photo"] }], want)[0]).toContain("게시 전 공유");
    const shared = data({ permissions: new Map([["p1", perm("p1", { allowedUse: ["sent-photo", "preview"], checklist: { "preview-shared": "2026-11-17" } })]]) });
    expect(checkPublishPermissions([{ participantId: "p1", uses: ["photo"] }], shared)).toEqual([]);
  });

  it("모르는 출전 id도 막아요", () => {
    expect(checkPublishPermissions([{ participantId: "nope", uses: ["photo"] }], data())[0]).toContain("출전을 찾을 수 없어요");
  });
});

describe("허락 문 읽기(loadPublishGate)", () => {
  beforeEach(() => {
    (globalThis as unknown as { __roamStore?: unknown }).__roamStore = undefined;
  });

  it("저장소의 출전 허락과 브랜드 연락처를 읽어 판단해요(쓰지 않아요)", async () => {
    const repo = new MockRepository();
    const store = (globalThis as unknown as { __roamStore?: { exhibitorGraph: ExhibitorGraph } });
    await repo.loadExhibitorGraph();
    const graph = store.__roamStore!.exhibitorGraph;
    graph.exhibitors.push({ id: "ex_a", canonicalName: "가" }, { id: "ex_b", canonicalName: "나" });
    graph.participants.push(
      { id: "pt_a", exhibitorId: "ex_a", exhibitionId: "exh_house_archive_2026", displayName: "가" },
      { id: "pt_b", exhibitorId: "ex_b", exhibitionId: "exh_house_archive_2026", displayName: "나" },
    );
    await repo.upsertParticipantPermission("pt_a", { status: "granted", allowedUse: ["account-photo"] }, "ted");
    await repo.upsertBrandOutreach("ex_b", { doNotContact: true }, "ted");
    const reasons = await loadPublishGate(repo, [
      { participantId: "pt_a", uses: ["photo"] },
      { participantId: "pt_b", uses: ["photo"] },
    ]);
    expect(reasons).toEqual([
      "나: 연락하지 않기로 한 브랜드라 게시할 수 없어요",
      "나: 허락 기록이 없어요. 허락을 받고 연락 보드에 남긴 뒤 게시해 주세요",
    ]);
  });
});
