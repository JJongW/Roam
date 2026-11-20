import { describe, expect, it } from "vitest";
import { planParticipantNameCandidates } from "./participant-candidates";
import { candidateKeys } from "./plan";
import type { ExhibitorGraph } from "@/lib/types";

// 새해 준비상점(부스 0)에 이미 들어간 참가 ↔ 하우스 아카이브의 기존 브랜드.
const graph: ExhibitorGraph = {
  exhibitors: [
    { id: "exr_xpip468cmupq9q23", canonicalName: "네츄럴굿띵스", instagramUrl: "https://instagram.com/ngt_kr" },
    { id: "exr_ny311", canonicalName: "네츄럴굿띵스", aliases: ["NGT"] },
    { id: "exr_ny200", canonicalName: "하치공방" },
  ],
  participants: [
    { id: "pt_house", exhibitorId: "exr_xpip468cmupq9q23", exhibitionId: "exh_house", displayName: "네츄럴굿띵스" },
    { id: "pt_ny311", exhibitorId: "exr_ny311", exhibitionId: "exh_ny", displayName: "네츄럴굿띵스", aliases: ["NGT"] },
    { id: "pt_ny200", exhibitorId: "exr_ny200", exhibitionId: "exh_ny", displayName: "하치공방" },
  ],
  assignments: [],
  candidates: [],
};
const existing = [
  { id: "exr_xpip468cmupq9q23", keys: ["instagram.com/ngt_kr"], names: ["네츄럴굿띵스"] },
  { id: "exr_ny311", keys: [], names: ["네츄럴굿띵스", "NGT"] },
  { id: "exr_ny200", keys: [], names: ["하치공방"] },
];

describe("planParticipantNameCandidates", () => {
  it("한 박람회의 참가 중 이름만 같은 다른 브랜드를 부스 없이 후보로 낸다", () => {
    const r = planParticipantNameCandidates({ exhibitionId: "exh_ny", graph, existing, decidedCandidates: new Set() });
    expect(r.candidates).toEqual([
      expect.objectContaining({ participantId: "pt_ny311", fromExhibitorId: "exr_ny311", exhibitorId: "exr_xpip468cmupq9q23", reason: '이름이 같아요: "네츄럴굿띵스"' }),
    ]);
    expect(r.exhibitorPlan.candidates).toEqual([
      { participantRef: { existing: "pt_ny311" }, target: { existing: "exr_xpip468cmupq9q23" }, reason: '이름이 같아요: "네츄럴굿띵스"' },
    ]);
    expect(r.exhibitorPlan.candidates[0]).not.toHaveProperty("boothId");
  });

  it("이미 낸 짝은 다시 내지 않는다(대기든 반려든)", () => {
    const decided = candidateKeys([{ boothId: null, participantId: "pt_ny311", exhibitorId: "exr_xpip468cmupq9q23" }]);
    expect(planParticipantNameCandidates({ exhibitionId: "exh_ny", graph, existing, decidedCandidates: decided }).candidates).toEqual([]);
  });

  it("다른 박람회는 보지 않는다", () => {
    expect(planParticipantNameCandidates({ exhibitionId: "exh_moongu", graph, existing, decidedCandidates: new Set() }).candidates).toEqual([]);
  });

  it("같은 박람회 안 동명 브랜드 둘은 짝 하나만 낸다", () => {
    const g: ExhibitorGraph = {
      ...graph,
      exhibitors: [...graph.exhibitors, { id: "exr_dup", canonicalName: "하치공방" }],
      participants: [...graph.participants, { id: "pt_dup", exhibitorId: "exr_dup", exhibitionId: "exh_ny", displayName: "하치공방" }],
    };
    const ex = [...existing, { id: "exr_dup", keys: [], names: ["하치공방"] }];
    const r = planParticipantNameCandidates({ exhibitionId: "exh_ny", graph: g, existing: ex, decidedCandidates: new Set() });
    expect(r.candidates.filter((c) => c.matchedName === "하치공방")).toHaveLength(1);
  });
});
