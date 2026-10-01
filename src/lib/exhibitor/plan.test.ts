import { describe, expect, it } from "vitest";
import { planExhibitorLinks, type PlanBooth } from "./plan";

const b = (over: Partial<PlanBooth> & { id: string; exhibitionId: string; name: string }): PlanBooth => ({
  kind: "exhibitor",
  ...over,
});

describe("planExhibitorLinks — 백필", () => {
  it("인스타가 같으면 다른 회차여도 한 참가사로 묶고, 회차마다 표기 이름을 따로 둔다", () => {
    const plan = planExhibitorLinks({
      booths: [
        b({ id: "b1", exhibitionId: "mlm", name: "프리미엄 남아공 수제 육포", instagramUrl: "https://www.instagram.com/vlees_biltong" }),
        b({ id: "b2", exhibitionId: "siwse", name: "블리스", instagramUrl: "https://instagram.com/vlees_biltong/" }),
      ],
    });
    expect(plan.exhibitors).toHaveLength(1);
    expect(plan.participants.map((p) => [p.exhibitionId, p.displayName]).sort()).toEqual([
      ["mlm", "프리미엄 남아공 수제 육포"],
      ["siwse", "블리스"],
    ]);
    expect(plan.assignments).toHaveLength(2);
    expect(plan.candidates).toEqual([]);
  });

  it("도메인 끝이 달라도(.com ↔ .co.kr) 같은 참가사다", () => {
    const plan = planExhibitorLinks({
      booths: [
        b({ id: "b1", exhibitionId: "a", name: "국순당여주명주", websiteUrl: "https://www.ksdyeoju.com" }),
        b({ id: "b2", exhibitionId: "b", name: "(농)국순당여주명주㈜", websiteUrl: "https://ksdyeoju.co.kr" }),
      ],
    });
    expect(plan.exhibitors).toHaveLength(1);
  });

  it("같은 회차의 두 부스가 같은 브랜드면 참가 사실은 하나, 배정은 둘이다", () => {
    const plan = planExhibitorLinks({
      booths: [
        b({ id: "b1", exhibitionId: "siwse", name: "꼬마루 육포", instagramUrl: "https://www.instagram.com/kkomaroo" }),
        b({ id: "b2", exhibitionId: "siwse", name: "꼬마루 육전", instagramUrl: "https://www.instagram.com/kkomaroo" }),
      ],
    });
    expect(plan.participants).toHaveLength(1);
    expect(plan.assignments.map((a) => a.boothId).sort()).toEqual(["b1", "b2"]);
  });

  // 0040 원칙: 이름이 같아도 다른 법인일 수 있다 — 자동 병합하지 않는다.
  it("이름만 같으면 따로 두고 연결 후보를 남긴다", () => {
    const plan = planExhibitorLinks({
      booths: [
        b({ id: "b1", exhibitionId: "mlm", name: "메멜트" }),
        b({ id: "b2", exhibitionId: "siwse", name: "메멜트" }),
      ],
    });
    expect(plan.exhibitors).toHaveLength(2);
    expect(plan.candidates).toHaveLength(1);
    expect(plan.candidates[0].reason).toContain("메멜트");
  });

  it("플랫폼 주소는 계정으로 본다 — 스마트스토어가 같다고 같은 브랜드가 아니다", () => {
    const plan = planExhibitorLinks({
      booths: [
        b({ id: "b1", exhibitionId: "a", name: "가", websiteUrl: "https://smartstore.naver.com/aaa" }),
        b({ id: "b2", exhibitionId: "b", name: "나", websiteUrl: "https://smartstore.naver.com/bbb" }),
      ],
    });
    expect(plan.exhibitors).toHaveLength(2);
  });

  it("시설은 참가사가 없다", () => {
    const plan = planExhibitorLinks({
      booths: [b({ id: "f1", exhibitionId: "a", name: "서비스센터", kind: "facility" })],
    });
    expect(plan.exhibitors).toEqual([]);
  });
});

describe("planExhibitorLinks — 재실행·인입", () => {
  it("이미 배정된 부스는 건드리지 않는다(멱등)", () => {
    const plan = planExhibitorLinks({
      booths: [b({ id: "b1", exhibitionId: "a", name: "메멜트", instagramUrl: "https://instagram.com/memelt" })],
      assignedBoothIds: new Set(["b1"]),
      exhibitors: [{ id: "ex1", keys: ["instagram.com/memelt"], names: ["메멜트"] }],
    });
    expect(plan.exhibitors).toEqual([]);
    expect(plan.assignments).toEqual([]);
    expect(plan.candidates).toEqual([]);
  });

  it("새 회차의 부스가 기존 참가사의 인스타와 같으면 기존 참가사에 붙인다", () => {
    const plan = planExhibitorLinks({
      booths: [b({ id: "b9", exhibitionId: "new", name: "메멜트 MEMELT", instagramUrl: "https://instagram.com/memelt" })],
      exhibitors: [{ id: "ex1", keys: ["instagram.com/memelt"], names: ["메멜트"] }],
    });
    expect(plan.exhibitors).toEqual([]);
    expect(plan.participants).toEqual([
      expect.objectContaining({ exhibitorRef: { existing: "ex1" }, exhibitionId: "new", displayName: "메멜트 MEMELT" }),
    ]);
  });

  it("기존 참가사와 이름만 같으면 새 참가사 + 후보, 이미 판단한 후보는 다시 안 낸다", () => {
    const input = {
      booths: [b({ id: "b9", exhibitionId: "new", name: "메멜트" })],
      exhibitors: [{ id: "ex1", keys: [], names: ["메멜트"] }],
    };
    expect(planExhibitorLinks(input).candidates).toEqual([
      expect.objectContaining({ boothId: "b9", target: { existing: "ex1" } }),
    ]);
    expect(
      planExhibitorLinks({ ...input, decidedCandidates: new Set(["b9|ex1"]) }).candidates,
    ).toEqual([]);
  });
});
