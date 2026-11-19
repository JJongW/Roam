import { beforeEach, describe, expect, it } from "vitest";
import { MockRepository } from "@/lib/mock/repository";
import type { ExhibitorGraph } from "@/lib/types";
import { GET } from "./route";

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const graph = () =>
  (globalThis as unknown as { __roamStore: { exhibitorGraph: ExhibitorGraph } }).__roamStore.exhibitorGraph;

// iOS 부스 상세 브랜드 줄(UI 19-A1)이 부스 이름 대신 브랜드 이름을 쓴다(2026-11-19).
describe("GET /api/booths/[id] 브랜드 이름", () => {
  const repo = new MockRepository();
  let boothId: string;

  beforeEach(async () => {
    (globalThis as unknown as { __roamStore?: unknown }).__roamStore = undefined;
    boothId = (await repo.listBooths("sibf-2026")).data[0].id;
  });

  it("대표 배정이 있으면 exhibitorId와 함께 브랜드 이름을 싣는다", async () => {
    const g = graph();
    g.exhibitors.push({ id: "ex1", canonicalName: "꽃잠" });
    g.participants.push({ id: "pt1", exhibitorId: "ex1", exhibitionId: "e", displayName: "꽃잠 부스" });
    g.assignments.push({ boothId, participantId: "pt1", role: "primary" });
    const body = await (await GET(new Request("http://localhost"), ctx(boothId))).json();
    expect(body.data.booth).toMatchObject({ id: boothId, exhibitorId: "ex1", participantId: "pt1", exhibitorName: "꽃잠" });
  });

  it("배정이 없으면 브랜드 키를 싣지 않는다(옛 응답 모양 그대로)", async () => {
    const body = await (await GET(new Request("http://localhost"), ctx(boothId))).json();
    expect(body.data.booth).not.toHaveProperty("exhibitorId");
    expect(body.data.booth).not.toHaveProperty("exhibitorName");
  });
});
