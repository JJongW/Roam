import { describe, expect, it } from "vitest";
import { isEventSpecific, planCarryover, stripEventSpecific, type CarryBooth } from "./carryover";

const booth = (over: Partial<CarryBooth> & { id: string; exhibitionId: string }): CarryBooth => ({
  name: over.id,
  images: [],
  ...over,
});

const graph = {
  exhibitors: [{ id: "ex1", canonicalName: "메멜트" }],
  participants: [
    { id: "p-old", exhibitorId: "ex1", exhibitionId: "mlm", displayName: "메멜트" },
    { id: "p-new", exhibitorId: "ex1", exhibitionId: "siwse", displayName: "메멜트 MEMELT" },
  ],
  assignments: [
    { boothId: "old", participantId: "p-old", role: "primary" as const },
    { boothId: "new", participantId: "p-new", role: "primary" as const },
  ],
  candidates: [],
};
const exhibitions = [
  { id: "mlm", name: "2026 마곡리빙마켓", startDate: "2026-09-10" },
  { id: "siwse", name: "2026 서울국제주류&와인박람회 마곡", startDate: "2026-10-01" },
];
const filled = {
  summary: "2016년부터 크림치즈만 만들어 온 전문점이다.",
  roamInterpretation: "베이글 없이도 먹는 크림치즈를 맛볼 수 있어.",
  valueTags: [{ slug: "goods", strength: 0.8 }],
  recommendationReasons: { goods: "크림치즈를 맛보고 고를 수 있어." },
  thingsToDo: ["크림치즈 시식하기", "선착순 50명 무료 티켓 받기"],
  timing: ["오후 3시 품절"],
  memoryHooks: ["크림치즈"],
};

describe("planCarryover", () => {
  it("지난 회차의 승인된 정보를 이번 부스 초안으로 넘긴다 — 행사 고유의 것은 빼고", () => {
    const plan = planCarryover({
      exhibitionId: "siwse",
      graph,
      exhibitions,
      booths: [
        booth({ id: "old", exhibitionId: "mlm", enrichment: filled, images: ["/a.webp"], instagramUrl: "https://instagram.com/memelt" }),
        booth({ id: "new", exhibitionId: "siwse" }),
      ],
    });
    expect(plan).toHaveLength(1);
    const c = plan[0];
    expect(c.boothId).toBe("new");
    expect(c.sourceBoothId).toBe("old");
    expect(c.payload.summary).toBe(filled.summary);
    expect(c.payload.thingsToDo).toEqual(["크림치즈 시식하기"]);
    expect("timing" in c.payload).toBe(false);
    // 비어 있는 사진·링크만 채운다.
    expect(c.boothPatch).toEqual({ images: ["/a.webp"], instagramUrl: "https://instagram.com/memelt" });
    expect(c.sourceLabel).toBe("2026 마곡리빙마켓「메멜트」");
  });

  it("이미 채워진 부스는 건드리지 않는다", () => {
    const plan = planCarryover({
      exhibitionId: "siwse",
      graph,
      exhibitions,
      booths: [
        booth({ id: "old", exhibitionId: "mlm", enrichment: filled }),
        booth({ id: "new", exhibitionId: "siwse", enrichment: { summary: "a", roamInterpretation: "b" } }),
      ],
    });
    expect(plan).toEqual([]);
  });

  it("원천이 없으면(다른 회차도 비어 있으면) 아무것도 안 한다", () => {
    const plan = planCarryover({
      exhibitionId: "siwse",
      graph,
      exhibitions,
      booths: [booth({ id: "old", exhibitionId: "mlm" }), booth({ id: "new", exhibitionId: "siwse" })],
    });
    expect(plan).toEqual([]);
  });

  it("이미 대기 중인 초안이 있는 부스는 건너뛴다", () => {
    const plan = planCarryover({
      exhibitionId: "siwse",
      graph,
      exhibitions,
      booths: [booth({ id: "old", exhibitionId: "mlm", enrichment: filled }), booth({ id: "new", exhibitionId: "siwse" })],
      pendingBoothIds: new Set(["new"]),
    });
    expect(plan).toEqual([]);
  });
});

describe("isEventSpecific", () => {
  it("행사 한정 표현을 잡는다", () => {
    for (const s of ["선착순 50명 무료 티켓", "C-02 부스에서 만나요", "10월 3일까지 할인", "현장 추첨 이벤트", "맛보고 사 가는 부스라 오후엔 줄이 생겨", "오후 3시면 품절돼", "커스템 부스(B-03)에도 같은 에디션이 있어", "F-14에서 만나"]) {
      expect(isEventSpecific(s)).toBe(true);
    }
  });
  it("브랜드 일반 사실은 통과시킨다", () => {
    for (const s of ["크림치즈 시식하기", "2016년부터 크림치즈만 만들어 왔다"]) {
      expect(isEventSpecific(s)).toBe(false);
    }
  });
});

describe("stripEventSpecific", () => {
  it("걸리는 문장만 빼고 나머지는 남긴다", () => {
    expect(stripEventSpecific("디저트를 만드는 곳이야. 맛보고 사 가는 부스라 오후엔 줄이 생겨.")).toBe("디저트를 만드는 곳이야.");
  });
  it("다른 행사의 부스 번호를 말하는 문장을 뺀다(와이낫 ← 레어로우, 2026-10-05)", () => {
    expect(
      stripEventSpecific("선반을 필요한 만큼 짜 맞추는 모듈 시스템을 만드는 곳이야. 커스템 부스(B-03)에도 같은 에디션이 있어."),
    ).toBe("선반을 필요한 만큼 짜 맞추는 모듈 시스템을 만드는 곳이야.");
  });
  it("전부 걸리면 비운다", () => {
    expect(stripEventSpecific("선착순 50명 무료 티켓!")).toBeUndefined();
  });
});
