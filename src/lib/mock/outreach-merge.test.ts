import { beforeEach, describe, expect, it } from "vitest";
import { MockRepository } from "./repository";
import { planFromRepository } from "@/lib/exhibitor/service";
import type { ExhibitorGraph } from "@/lib/types";

/** STEP 1 전 운영처럼 연락 테이블이 없는 저장소. */
class BoothOnlyRepository extends MockRepository {
  async hasParticipantOutreach() {
    return false;
  }
}

beforeEach(() => {
  (globalThis as unknown as { __roamStore?: unknown }).__roamStore = undefined;
});

const graphOf = () => (globalThis as unknown as { __roamStore: { exhibitorGraph: ExhibitorGraph } }).__roamStore.exhibitorGraph;

/** 연결 후보 하나: from 브랜드의 출전 pFrom, 같은 박람회에 to 브랜드의 출전 pTo를 하나 더 둔다. */
async function setup(repo: MockRepository) {
  const { plan } = await planFromRepository(repo);
  await repo.applyExhibitorPlan(plan);
  const [cand] = await repo.listExhibitorLinkCandidates("pending");
  const g = graphOf();
  const asg = g.assignments.find((a) => a.boothId === cand.boothId && a.role === "primary")!;
  const pFrom = g.participants.find((p) => p.id === asg.participantId)!;
  const from = pFrom.exhibitorId;
  const to = cand.exhibitorId;
  let pTo = g.participants.find((p) => p.exhibitorId === to && p.exhibitionId === pFrom.exhibitionId);
  if (!pTo) {
    pTo = { id: "pt_to", exhibitorId: to, exhibitionId: pFrom.exhibitionId, displayName: "대상" };
    g.participants.push(pTo);
  }
  return { cand, from, to, pFrom: pFrom.id, pTo: pTo.id, exhibitionId: pFrom.exhibitionId };
}

describe("브랜드 합치기에서 연락 옮기기(0062 move_* 함수와 같은 규칙)", () => {
  it("대상이 아직 안 보냄이면 from 허락을 쓰고, VOC와 브랜드 연락처도 대상으로", async () => {
    const repo = new MockRepository();
    const s = await setup(repo);
    await repo.upsertParticipantPermission(s.pFrom, { status: "granted", sentAt: "2026-11-01", allowedUse: ["tag"] }, "ted");
    await repo.upsertParticipantPermission(s.pTo, { status: "not-sent" }, null);
    await repo.upsertBrandOutreach(s.from, { handle: "@from", channel: "instagram", doNotContact: true }, "ted");
    await repo.upsertBrandOutreach(s.to, { handle: "@to" }, null);
    await repo.addBrandOutreachLog({ exhibitorId: s.from, participantId: s.pFrom, direction: "inbound", kind: "permission", summary: "허락" }, null);
    await repo.addBrandOutreachLog({ exhibitorId: s.from, direction: "internal", kind: "other", summary: "브랜드 메모" }, null);

    await repo.decideExhibitorLinkCandidate(s.cand.id, "approved", "ted");

    const perms = await repo.listParticipantPermissions(s.exhibitionId);
    expect(perms.find((p) => p.participantId === s.pFrom)).toBeUndefined();
    expect(perms.find((p) => p.participantId === s.pTo)).toMatchObject({ status: "granted", sentAt: "2026-11-01", allowedUse: ["tag"] });
    expect(await repo.listBrandOutreach([s.from])).toHaveLength(0);
    // 대상 값이 먼저, 빈 칸만 from으로, 연락 금지는 둘 중 하나라도
    expect(await repo.listBrandOutreach([s.to])).toMatchObject([{ handle: "@to", channel: "instagram", doNotContact: true }]);
    const logs = await repo.listBrandOutreachLogs([s.to, s.from]);
    expect(logs.map((l) => [l.exhibitorId, l.participantId, l.summary]).sort()).toEqual(
      [
        [s.to, null, "브랜드 메모"],
        [s.to, s.pTo, "허락"],
      ].sort(),
    );
  });

  it("대상에 진행된 허락이 있으면 대상 것을 지키고 from 행은 지운다", async () => {
    const repo = new MockRepository();
    const s = await setup(repo);
    await repo.upsertParticipantPermission(s.pFrom, { status: "declined" }, null);
    await repo.upsertParticipantPermission(s.pTo, { status: "sent", sentAt: "2026-11-10" }, null);
    await repo.decideExhibitorLinkCandidate(s.cand.id, "approved", "ted");
    const perms = await repo.listParticipantPermissions(s.exhibitionId);
    expect(perms.filter((p) => [s.pFrom, s.pTo].includes(p.participantId))).toMatchObject([
      { participantId: s.pTo, status: "sent", sentAt: "2026-11-10" },
    ]);
  });

  it("대상에 행이 없으면 from 행이 그대로 대상 것이 된다", async () => {
    const repo = new MockRepository();
    const s = await setup(repo);
    await repo.upsertParticipantPermission(s.pFrom, { status: "read" }, null);
    await repo.upsertBrandOutreach(s.from, { handle: "@from" }, null);
    await repo.decideExhibitorLinkCandidate(s.cand.id, "approved", "ted");
    expect((await repo.listParticipantPermissions(s.exhibitionId)).find((p) => p.participantId === s.pTo)).toMatchObject({ status: "read" });
    expect(await repo.listBrandOutreach([s.to])).toMatchObject([{ exhibitorId: s.to, handle: "@from" }]);
  });

  it("부스 키 폴백 모드(연락 테이블 없음)에서는 옮기지 않는다", async () => {
    const repo = new BoothOnlyRepository();
    const s = await setup(repo);
    await repo.upsertParticipantPermission(s.pFrom, { status: "granted" }, null);
    await repo.upsertBrandOutreach(s.from, { handle: "@from" }, null);
    await repo.decideExhibitorLinkCandidate(s.cand.id, "approved", "ted");
    expect((await repo.listParticipantPermissions(s.exhibitionId)).map((p) => p.participantId)).toEqual([s.pFrom]);
    expect(await repo.listBrandOutreach([s.from])).toHaveLength(1);
    expect(await repo.listBrandOutreach([s.to])).toHaveLength(0);
  });
});
