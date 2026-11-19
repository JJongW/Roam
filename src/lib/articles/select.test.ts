import { describe, expect, it } from "vitest";
import { brandFacts, displayBrandName, permittedPhotos } from "./facts";
import { composeTemplate } from "./compose";
import { kindOrder, leadQuote, photoCoverage, pickCandidates } from "./select";
import { field, photos, PERMISSIONS, world } from "./__fixtures__";

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

describe("사진 — 허락 받은 사진만(2026-11-19 Ted)", () => {
  it("대표 사진 칸 확인과 그 회차 허락이 둘 다 있어야 쓴다", () => {
    const w = world();
    const hachi = brandFacts(w, "ex_hachi")!;
    expect(permittedPhotos(hachi, "pt_hachi_ny").map((p) => p.path)).toEqual(photos("hachi").map((p) => p.path));
    expect(permittedPhotos(hachi, "pt_hachi_ny")[0]).toMatchObject({ credit: "사진 하치", permissionId: "perm:pt_hachi_ny" });
    // 지난 회차엔 허락이 없다 — 허락은 회차마다 따로.
    expect(permittedPhotos(brandFacts(w, "ex_gusan")!, "pt_gusan_old")).toEqual([]);
  });

  it("명단 가져오기가 채운 주최 측 공개 사진(collected)은 허락이 있어도 쓰지 않는다", () => {
    const w = world();
    w.fields = w.fields.map((f) => (f.exhibitorId === "ex_draft" && f.field === "intro" ? { ...f, status: "collected" as const } : f));
    const draft = brandFacts(w, "ex_draft")!;
    expect(draft.photoField).toBeUndefined();
    expect(pickCandidates(w, [], { kind: "brand_intro", limit: 50 }).map((x) => x.subjectKey)).not.toContain("brand:ex_draft");
  });

  it.each([
    ["허락 없음", { pt_hachi_ny: undefined }],
    ["답장만(replied)", { pt_hachi_ny: { status: "replied" as const, allowedUse: ["sent-photo"] } }],
    ["거절", { pt_hachi_ny: { status: "declined" as const, allowedUse: ["sent-photo"] } }],
    ["사진 아닌 허락만(글, 계정 표기)", { pt_hachi_ny: { status: "granted" as const, allowedUse: ["text", "tag"] } }],
  ])("%s: 브랜드 소개 후보가 아니다", (_, over) => {
    const perms = { ...PERMISSIONS, ...over };
    const w = world({ permissions: Object.fromEntries(Object.entries(perms).filter(([, v]) => v)) as typeof PERMISSIONS });
    expect(pickCandidates(w, [], { kind: "brand_intro", limit: 50 }).map((x) => x.subjectKey)).not.toContain("brand:ex_hachi");
  });

  it("로컬 디스크 경로처럼 앱에서 열리지 않는 사진은 없는 것으로 본다", () => {
    const w = world();
    w.fields = w.fields.map((f) =>
      f.exhibitorId === "ex_hachi" && f.field === "photos" ? { ...f, value: [{ path: "/Volumes/One Touch/hachi.jpg", scope: "작가가 보낸 사진" }] } : f,
    );
    expect(brandFacts(w, "ex_hachi")!.photoField).toBeUndefined();
  });

  it("브랜드 소개: 첫 장이 대표 사진, 나머지 두 장은 사진 묶음", () => {
    const w = world();
    const d = composeTemplate(pickCandidates(w, [], { kind: "brand_intro" })[0], w.fields);
    expect(d.hero.path).toBe("/articles/test/hachi_1.webp");
    const group = d.body.find((b) => b.type === "photo-group");
    expect(group && group.type === "photo-group" && group.photos.map((p) => p.path)).toEqual(["/articles/test/hachi_2.webp", "/articles/test/hachi_3.webp"]);
    expect(d.sources.map((x) => x.kind)).toEqual(expect.arrayContaining(["photo", "permission"]));
  });

  it("모음: 사진 없는 브랜드는 빠지고 브랜드마다 사진 있는 카드가 하나씩", () => {
    const w = world({ permissions: { ...PERMISSIONS, pt_diary_ny: { status: "no-reply", allowedUse: [] } } });
    const c = pickCandidates(w, [], { kind: "fair_roundup" })[0];
    expect(c.kind === "fair_roundup" && c.brands.map((b) => b.exhibitorId)).toEqual(["ex_hachi", "ex_gusan", "ex_paper"]);
    const d = composeTemplate(c, w.fields);
    const cards = d.body.filter((b) => b.type === "brand-card");
    expect(cards.map((b) => b.type === "brand-card" && b.exhibitorId)).toEqual(["ex_hachi", "ex_gusan", "ex_paper"]);
    expect(cards.every((b) => b.type === "brand-card" && b.photo.permissionId.startsWith("perm:"))).toBe(true);
    // 대표 사진은 첫 브랜드의 둘째 장(카드와 겹치지 않게).
    expect(d.hero.path).toBe("/articles/test/hachi_2.webp");
  });

  it("모음: 사진 있는 브랜드가 셋 미만이면 그 박람회를 건너뛴다", () => {
    const w = world({ permissions: { pt_hachi_ny: PERMISSIONS.pt_hachi_ny, pt_gusan_ny: PERMISSIONS.pt_gusan_ny } });
    expect(pickCandidates(w, [], { kind: "fair_roundup" })).toEqual([]);
  });

  it("photoCoverage는 사진 조건에서 몇 곳이 걸러지는지 센다", () => {
    const c = photoCoverage(world());
    expect(c).toMatchObject({ brands: 5, introReady: 4, photoFieldAny: 5, photoFieldConfirmed: 4, photoGranted: 5, introQualified: 4 });
    expect(c.fairs).toEqual([{ exhibitionId: "exh_ny", name: "새해 준비상점", withQuote: 4, withQuoteAndPhoto: 4, qualifies: true }]);
    const none = photoCoverage(world({ permissions: {} }));
    expect(none).toMatchObject({ introQualified: 0, photoGranted: 0 });
    expect(none.fairs[0].qualifies).toBe(false);
  });
});
