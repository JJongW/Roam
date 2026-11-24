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

  // SDF 2026 E-27: 부스 연결이 별칭을 못 봐 새 브랜드(exr_59k)에 이어 버린 부스. 다음 인입에선 ex: 묶음이라
  // 이름 판정을 다시 안 하니, 참가 단위 후보로 "진주 복숭아주"(부스 없는 참가 사실)에 올린다.
  describe("배정된 부스의 이름과 별칭", () => {
    const g: ExhibitorGraph = {
      exhibitors: [
        { id: "exr_59k", canonicalName: "진주도원" },
        { id: "exr_aerj", canonicalName: "진주 복숭아주" },
      ],
      participants: [
        { id: "pt_e27", exhibitorId: "exr_59k", exhibitionId: "exh_sdf", displayName: "진주도원" },
        { id: "pt_20325", exhibitorId: "exr_aerj", exhibitionId: "exh_sdf", displayName: "진주 복숭아주" },
      ],
      assignments: [{ boothId: "booth_e27", participantId: "pt_e27", role: "primary" }],
      candidates: [],
    };
    const ex = [
      { id: "exr_59k", keys: [], names: ["진주도원"] },
      { id: "exr_aerj", keys: [], names: ["진주 복숭아주"] },
    ];
    const booths = [{ id: "booth_e27", name: "진주도원", aliases: ["진주 복숭아주"] }];

    it("부스 별칭이 같은 박람회의 다른 브랜드 이름과 같으면 후보로 올린다", () => {
      const r = planParticipantNameCandidates({ exhibitionId: "exh_sdf", graph: g, existing: ex, decidedCandidates: new Set(), booths });
      expect(r.candidates).toEqual([
        expect.objectContaining({
          participantId: "pt_e27",
          fromExhibitorId: "exr_59k",
          exhibitorId: "exr_aerj",
          matchedName: "진주 복숭아주",
          reason: '이름이 같아요: "진주 복숭아주"',
        }),
      ]);
      // 후보만 낸다. 새 브랜드, 참가, 배정은 없다(합치기는 /admin/brands/links 승인).
      expect(r.exhibitorPlan).toMatchObject({ exhibitors: [], participants: [], assignments: [] });
    });

    it("공동입점 부스(별칭에 자기 브랜드 이름이 있음)는 별칭으로 후보를 내지 않는다", () => {
      // SDF H-05 "노톤&무나니스트": 노톤 참가에 배정, 별칭 노톤, 무나니스트. 승인하면 두 브랜드가 합쳐진다.
      const g2: ExhibitorGraph = {
        exhibitors: [
          { id: "exr_noton", canonicalName: "노톤" },
          { id: "exr_muna", canonicalName: "무나니스트" },
        ],
        participants: [
          { id: "pt_noton", exhibitorId: "exr_noton", exhibitionId: "exh_sdf", displayName: "노톤" },
          { id: "pt_muna", exhibitorId: "exr_muna", exhibitionId: "exh_sdf", displayName: "무나니스트" },
        ],
        assignments: [{ boothId: "booth_h05", participantId: "pt_noton", role: "primary" }],
        candidates: [],
      };
      const ex2 = [
        { id: "exr_noton", keys: [], names: ["노톤"] },
        { id: "exr_muna", keys: [], names: ["무나니스트"] },
      ];
      const r = planParticipantNameCandidates({
        exhibitionId: "exh_sdf",
        graph: g2,
        existing: ex2,
        decidedCandidates: new Set(),
        booths: [{ id: "booth_h05", name: "노톤&무나니스트", aliases: ["노톤", "무나니스트"] }],
      });
      expect(r.candidates).toEqual([]);
    });

    it("별칭이 다른 브랜드 둘에 맞으면 별칭으로 후보를 내지 않는다", () => {
      const g3: ExhibitorGraph = {
        ...g,
        exhibitors: [...g.exhibitors, { id: "exr_haechi", canonicalName: "하치공방" }],
        participants: [...g.participants, { id: "pt_haechi", exhibitorId: "exr_haechi", exhibitionId: "exh_sdf", displayName: "하치공방" }],
      };
      const r = planParticipantNameCandidates({
        exhibitionId: "exh_sdf",
        graph: g3,
        existing: [...ex, { id: "exr_haechi", keys: [], names: ["하치공방"] }],
        decidedCandidates: new Set(),
        booths: [{ id: "booth_e27", name: "진주도원", aliases: ["진주 복숭아주", "하치공방"] }],
      });
      expect(r.candidates).toEqual([]);
    });

    it("booths를 안 주면 예전처럼 부스 별칭은 보지 않는다", () => {
      expect(planParticipantNameCandidates({ exhibitionId: "exh_sdf", graph: g, existing: ex, decidedCandidates: new Set() }).candidates).toEqual([]);
    });

    it("이미 낸 짝은 다시 내지 않는다", () => {
      const decided = candidateKeys([{ boothId: null, participantId: "pt_e27", exhibitorId: "exr_aerj" }]);
      expect(planParticipantNameCandidates({ exhibitionId: "exh_sdf", graph: g, existing: ex, decidedCandidates: decided, booths }).candidates).toEqual([]);
    });
  });
});
