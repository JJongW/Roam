import { describe, expect, it } from "vitest";
import { brandFacts, displayBrandName } from "./facts";
import { kindOrder, leadQuote, pickCandidates } from "./select";
import { field, world } from "./__fixtures__";

describe("brandFacts — 확인된 칸만 사실로", () => {
  it("AI 초안 칸은 읽지 않는다", () => {
    const b = brandFacts(world(), "ex_draft")!;
    expect(b.intro).toBeUndefined();
    expect(b.confirmedCount).toBe(0);
  });

  it("작가 확인 소개와 다시 볼 것(stale)을 가른다", () => {
    const w = world();
    w.fields.push(field("ex_hachi", "items", ["스카프"], "stale"));
    const b = brandFacts(w, "ex_hachi")!;
    expect(b.intro?.original).toContain("단청");
    expect(b.items).toBeUndefined();
  });

  it("끝난 행사는 upcoming이 아니다", () => {
    const b = brandFacts(world(), "ex_gusan")!;
    expect(b.participations.map((p) => [p.exhibitionId, p.upcoming])).toEqual([
      ["exh_old", false],
      ["exh_ny", true],
    ]);
  });
});

describe("pickCandidates — 오늘의 주제", () => {
  it("처음엔 브랜드 소개부터. 소개에 이름이 나오는 브랜드, 여러 박람회에 나온 브랜드, 확인된 칸이 많은 브랜드 순", () => {
    const c = pickCandidates(world(), []);
    expect(c[0].kind).toBe("brand_intro");
    const brands = c.filter((x) => x.kind === "brand_intro").map((x) => x.subjectKey);
    expect(brands).toEqual(["brand:ex_hachi", "brand:ex_gusan", "brand:ex_paper", "brand:ex_diary"]);
    expect(brands).not.toContain("brand:ex_draft");
  });

  it("지난 편이 브랜드 소개면 박람회 모음을 먼저 본다(돌아가며)", () => {
    const c = pickCandidates(world(), [{ kind: "brand_intro", createdAt: "2026-11-18T00:30:00Z", subjectKey: "brand:ex_gusan" }]);
    expect(c[0]).toMatchObject({ kind: "fair_roundup", subjectKey: "fair:exh_ny" });
    expect(kindOrder([{ kind: "fair_roundup", createdAt: "x" }])).toEqual(["brand_intro", "fair_roundup"]);
  });

  it("이미 다룬 주제와 반려한 주제는 다시 고르지 않는다", () => {
    const c = pickCandidates(world(), [
      { kind: "brand_intro", createdAt: "2026-11-16T00:00:00Z", subjectKey: "brand:ex_hachi" },
      { kind: "brand_intro", createdAt: "2026-11-17T00:00:00Z", subjectKey: "brand:ex_gusan" },
      { kind: "fair_roundup", createdAt: "2026-11-18T00:00:00Z", subjectKey: "fair:exh_ny" },
    ]);
    expect(c.map((x) => x.subjectKey)).not.toContain("brand:ex_gusan");
    expect(c.map((x) => x.subjectKey)).not.toContain("fair:exh_ny");
    expect(c[0].subjectKey).toBe("brand:ex_paper");
  });

  it("끝난 박람회는 모음 후보가 아니고, 소개가 확인된 브랜드가 셋 미만이면 모음을 만들지 않는다", () => {
    const w = world();
    w.fields = w.fields.filter((f) => f.exhibitorId === "ex_hachi" || f.exhibitorId === "ex_gusan");
    const c = pickCandidates(w, [], { kind: "fair_roundup" });
    expect(c).toEqual([]);
  });

  it("소개가 짧거나 참가 사실이 없는 브랜드는 고르지 않는다", () => {
    const w = world();
    w.fields.push(field("ex_lonely", "intro", { original: "참가 사실이 없는 브랜드의 긴 소개 문장이에요. 사십 자를 넘기려고 더 적어요." }));
    w.graph.exhibitors.push({ id: "ex_lonely", canonicalName: "외톨이" });
    w.fields = w.fields.map((f) => (f.exhibitorId === "ex_diary" ? field("ex_diary", "intro", { original: "짧은 소개." }) : f));
    const keys = pickCandidates(w, [], { kind: "brand_intro", limit: 50 }).map((x) => x.subjectKey);
    expect(keys).not.toContain("brand:ex_lonely");
    expect(keys).not.toContain("brand:ex_diary");
  });
});

describe("leadQuote — 원문을 그대로 자른 인용", () => {
  it("40자를 넘길 때까지 문장을 잇고, 결과는 원문의 앞부분과 같다", () => {
    const o = "차가운 겨울 속 포근한 순간을 담아내었습니다. 소소한 일상에 아늑한 온기를 전할 수 있기를 바랍니다.";
    const q = leadQuote(o)!;
    expect(o.startsWith(q)).toBe(true);
    expect(q.length).toBeGreaterThanOrEqual(40);
  });
  it("첫 문장이 상한보다 길면 null", () => {
    expect(leadQuote("가".repeat(300) + ".")).toBeNull();
  });
});

describe("displayBrandName — Roam 글의 이름에 가운뎃점을 남기지 않는다", () => {
  it("이름과 소개말이 가운뎃점으로 붙어 온 것은 앞 이름만", () => {
    expect(displayBrandName("고동상 · 고양이와 동그란 세상")).toBe("고동상");
    expect(displayBrandName("하치")).toBe("하치");
  });
  it("공식 표기에 가운뎃점이 든 이름은 그대로", () => {
    expect(displayBrandName("동아시아·허블")).toBe("동아시아·허블");
  });
});

describe("leadQuote — 줄바꿈", () => {
  it("문장이 끝나지 않은 줄에서는 자르지 않는다", () => {
    const o = "소중한 순간을 종이 위에 붙잡아두는 즐거움을\n더 많은 사람들이 느낄 수 있기를 바라며,\n오늘도 종이를 고릅니다.";
    expect(leadQuote(o)).toBe(o);
  });
});
