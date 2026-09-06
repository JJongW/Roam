import { describe, expect, it } from "vitest";
import { planIntake } from "./plan";
import type { PlanInput } from "./plan";
import type { Booth, Category, Hall } from "@/lib/types";
import type { IntakeFile } from "./schema";

function booth(over: Partial<Booth> & { code: string }): Booth {
  return {
    id: `b_${over.code.toLowerCase()}`,
    exhibitionId: "e1",
    hallId: "h1",
    categoryId: "c1",
    name: over.code,
    company: over.code,
    description: "",
    longDescription: "",
    images: [],
    tags: [],
    x: 0,
    y: 0,
    popularity: 50,
    createdAt: "2026-01-01T00:00:00Z",
    ...over,
  };
}

const halls: Hall[] = [
  { id: "h1", exhibitionId: "e1", name: "본관", floor: 1, sort: 0 },
];
const categories: Category[] = [
  { id: "c1", slug: "collect", name: "수집의 집", color: "#000", icon: "box" },
];

function run(file: IntakeFile, over: Partial<PlanInput> = {}) {
  return planIntake({
    file,
    booths: [],
    halls,
    categories,
    floorplanBooths: [{ code: "H01", x: 120, y: 340, w: 40, h: 40 }],
    ...over,
  });
}

function file(booths: IntakeFile["booths"]): IntakeFile {
  return { version: 1, exhibitionSlug: "house-archive-2026", booths };
}

describe("planIntake — 신규", () => {
  it("없는 code는 만들고, 좌표는 도면에서 code로 가져온다", () => {
    const plan = run(file([{ code: "H01", name: "누키트", category: "수집의 집" }]));
    expect(plan.creates).toHaveLength(1);
    expect(plan.creates[0]).toMatchObject({ code: "H01", x: 120, y: 340 });
    expect(plan.warnings).toEqual([]);
  });

  it("도면에 없는 code는 0,0으로 만들고 경고를 남긴다", () => {
    const plan = run(file([{ code: "ZZ9", name: "미배치" }]));
    expect(plan.creates[0]).toMatchObject({ x: 0, y: 0 });
    expect(plan.warnings[0]).toContain("ZZ9");
  });

  it("없는 홀·카테고리 이름은 만들 목록에 올린다", () => {
    const plan = run(
      file([
        {
          code: "H01",
          name: "누키트",
          hall: "별관",
          category: "새분야",
          categorySlug: "new-field",
        },
      ]),
    );
    expect(plan.newHalls).toEqual(["별관"]);
    expect(plan.newCategories).toEqual([{ slug: "new-field", name: "새분야" }]);
  });

  it("새 카테고리인데 categorySlug가 없으면 에러 — 한글 이름에서 파생하지 않는다", () => {
    const plan = run(file([{ code: "H01", name: "누키트", category: "새분야" }]));
    expect(plan.creates).toHaveLength(0);
    expect(plan.errors[0].message).toContain("categorySlug");
  });

  it("이름 없는 새 부스는 에러로 빼고 만들지 않는다", () => {
    const plan = run(file([{ code: "H01" }]));
    expect(plan.creates).toHaveLength(0);
    expect(plan.errors[0].code).toBe("H01");
  });

  it("파일 안에서 code가 중복되면 뒤엣것을 에러로 뺀다", () => {
    const plan = run(
      file([
        { code: "H01", name: "누키트" },
        { code: "H01", name: "다른곳" },
      ]),
    );
    expect(plan.creates).toHaveLength(1);
    expect(plan.errors).toHaveLength(1);
  });
});

describe("planIntake — 채움", () => {
  const existing = [
    booth({
      code: "H01",
      description: "",
      websiteUrl: "https://old.example.com",
      enrichment: {
        goodsKeywords: [],
        themeTags: [],
        summary: "사람이 쓴 요약",
        thingsToDo: ["기존 할 일"],
      },
    }),
  ];

  it("빈 필드만 채우고 사람이 쓴 값은 건드리지 않는다", () => {
    const plan = run(
      file([
        {
          code: "H01",
          description: "새 설명",
          websiteUrl: "https://new.example.com",
        },
      ]),
      { booths: existing },
    );
    expect(plan.fills).toHaveLength(1);
    expect(plan.fills[0].boothPatch).toEqual({ description: "새 설명" });
    expect(plan.conflicts).toHaveLength(1);
    expect(plan.conflicts[0].field).toBe("websiteUrl");
  });

  it("저작 6종은 델타가 아니라 병합된 최종값을 돌려준다", () => {
    const plan = run(
      file([
        {
          code: "H01",
          enrichment: { timing: ["오전이 한산"], summary: "파일 요약" },
        },
      ]),
      { booths: existing },
    );
    const merged = plan.fills[0].enrichment!;
    // 기존 값은 그대로 살아 있어야 한다 — 컬럼을 통째로 덮어쓰기 때문이다.
    expect(merged.summary).toBe("사람이 쓴 요약");
    expect(merged.thingsToDo).toEqual(["기존 할 일"]);
    expect(merged.timing).toEqual(["오전이 한산"]);
    expect(plan.conflicts.map((c) => c.field)).toContain("enrichment.summary");
  });

  it("배열은 합집합을 만들지 않는다 — 차 있으면 충돌", () => {
    const plan = run(
      file([{ code: "H01", enrichment: { thingsToDo: ["새 할 일"] } }]),
      { booths: existing },
    );
    expect(plan.fills).toHaveLength(0);
    expect(plan.conflicts[0].field).toBe("enrichment.thingsToDo");
  });

  it("recommendationReasons는 키 단위로 병합한다", () => {
    const withReasons = [
      booth({
        code: "H01",
        enrichment: {
          goodsKeywords: [],
          themeTags: [],
          recommendationReasons: { goods: "기존 굿즈 이유" },
        },
      }),
    ];
    const plan = run(
      file([
        {
          code: "H01",
          enrichment: {
            recommendationReasons: { goods: "다른 굿즈 이유", rest: "쉴 곳" },
          },
        },
      ]),
      { booths: withReasons },
    );
    const merged = plan.fills[0].enrichment!;
    expect(merged.recommendationReasons).toEqual({
      goods: "기존 굿즈 이유", // 차 있던 키는 안 덮는다
      rest: "쉴 곳", // 빈 키는 채운다
    });
    expect(plan.conflicts[0].field).toBe(
      "enrichment.recommendationReasons.goods",
    );
  });

  it("overwrite면 충돌도 쓴다", () => {
    const plan = run(
      file([{ code: "H01", websiteUrl: "https://new.example.com" }]),
      { booths: existing, overwrite: true },
    );
    expect(plan.fills[0].boothPatch).toEqual({
      websiteUrl: "https://new.example.com",
    });
    expect(plan.conflicts).toHaveLength(1); // 목록엔 그대로 남는다
  });

  it("로미 한 줄(roamInterpretation)도 빈 칸만 채우기 규칙을 탄다", () => {
    const withLine = [
      booth({
        code: "H01",
        enrichment: {
          goodsKeywords: [],
          themeTags: [],
          roamInterpretation: "사람이 쓴 한 줄",
        },
      }),
      booth({ code: "H02", enrichment: { goodsKeywords: [], themeTags: [] } }),
    ];
    const plan = run(
      file([
        { code: "H01", enrichment: { roamInterpretation: "파일 한 줄" } },
        { code: "H02", enrichment: { roamInterpretation: "파일 한 줄" } },
      ]),
      { booths: withLine },
    );
    expect(plan.conflicts[0].field).toBe("enrichment.roamInterpretation");
    expect(plan.fills).toHaveLength(1);
    expect(plan.fills[0].code).toBe("H02");
    expect(plan.fills[0].enrichment!.roamInterpretation).toBe("파일 한 줄");
  });

  it("멱등 — 이미 같은 값이면 아무것도 안 바뀐다", () => {
    const plan = run(
      file([
        {
          code: "H01",
          websiteUrl: "https://old.example.com",
          enrichment: { summary: "사람이 쓴 요약" },
        },
      ]),
      { booths: existing },
    );
    expect(plan.fills).toHaveLength(0);
    expect(plan.conflicts).toHaveLength(0);
    expect(plan.unchanged).toBe(1);
  });
});
