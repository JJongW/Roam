import { describe, expect, it } from "vitest";
import { buildSdfBrandsFile, parseSdfDetail, type SdfRestExhibitor } from "./sdf-official";

// 2025 상세 페이지(seoul.designfestival.co.kr/exhibitor/jogakmoeum/)의 모양을 줄였다.
const DETAIL = `<article class="sdf-page-frame sdf-exhibitor">
<h1 class="gb-text sdf-exhibitor-heading"><span class="sdf-exhibitor-title-ko" lang="ko">조각모음</span><span class="sdf-exhibitor-title-en" lang="en"><span class="ml-en">jogakmoeum</span></span></h1>
<div class="sdf-exhibitor-description">
<div class="gb-text sdf-ko" lang="ko"><p>과거와 현재를 담은 을지로의 아늑한 공간, 조각모음.</p>
<p>취향과 취미의 조각을 모아<br />
작은 이야기를 전하는 소품 숍이다.</p>
</div>
<div class="gb-text sdf-en" lang="en"><p><span class="ml-en">Tucked</span></p></div>
</div>
<div class="sdf-exhibitor-images"><img src="https://x/a.png" /></div>
<ul class="sdf-brand-links"><li class="is-instagram"><a href="https://www.instagram.com/jogakmoeum_vol.1" target="_blank">ig</a></li><li class="is-website"><a href="https://jogak.example/" target="_blank">web</a></li></ul>
</article>`;

describe("SDF 상세 읽기", () => {
  it("영문 이름, 한글 소개 문단, 인스타와 웹 링크를 읽어요", () => {
    expect(parseSdfDetail(DETAIL)).toEqual({
      nameEn: "jogakmoeum",
      introKo: "과거와 현재를 담은 을지로의 아늑한 공간, 조각모음.\n취향과 취미의 조각을 모아\n작은 이야기를 전하는 소품 숍이다.",
      instagramUrl: "https://www.instagram.com/jogakmoeum_vol.1",
      websiteUrl: "https://jogak.example/",
    });
  });

  it("칸이 없으면 null이에요", () => {
    expect(parseSdfDetail("<html></html>")).toEqual({ nameEn: null, introKo: null, instagramUrl: null, websiteUrl: null });
  });
});

const row = (id: number, name: string, term: number, type: number[] = []): SdfRestExhibitor => ({
  id,
  slug: `s${id}`,
  link: `https://seoul.designfestival.co.kr/exhibitor/s${id}/`,
  title: { rendered: name },
  exhibition_term: [term],
  exhibition_type: type,
  exhibition_year: [24],
});

describe("SDF 명단 → brands.v1", () => {
  const termNames = new Map([
    [16, "디자인브랜드"],
    [19, "서울디자인스팟"],
  ]);
  const typeNames = new Map([[30, "디자인&크래프트 무브먼트"]]);

  it("서울디자인스팟은 빼고, 상세가 있으면 소개와 링크를 넣고, 스키마를 통과해요", () => {
    const { file, excluded } = buildSdfBrandsFile({
      rows: [row(1, "모스", 16, [30]), row(2, "조각모음", 19), row(3, "Studio &amp; Co", 16)],
      termNames,
      typeNames,
      details: new Map([[1, parseSdfDetail(DETAIL.replace("jogakmoeum</span>", "mohs</span>"))]]),
      exhibitionSlug: "sdf-2025",
      sourceUrl: "https://seoul.designfestival.co.kr/wp-json/wp/v2/exhibitor?exhibition_year=24",
      collectedAt: "2026-11-17",
    });
    expect(excluded).toEqual([{ id: 2, name: "조각모음", term: "서울디자인스팟" }]);
    expect(file.version).toBe("brands.v1");
    expect(file.brands.map((b) => b.key)).toEqual(["sdf-1", "sdf-3"]);
    expect(file.brands[0]).toMatchObject({
      name: "모스",
      aliases: ["mohs"],
      instagramUrl: "https://www.instagram.com/jogakmoeum_vol.1",
      category: "디자인&크래프트 무브먼트",
      intro: { status: "collected", source: "https://seoul.designfestival.co.kr/exhibitor/s1/" },
    });
    // 상세가 없으면 이름과 참가 구분만
    expect(file.brands[1]).toEqual({ key: "sdf-3", name: "Studio & Co", category: "디자인브랜드" });
  });

  it("명단이 비면(2026 아직 미공개) 만들지 않아요", () => {
    expect(() =>
      buildSdfBrandsFile({ rows: [], termNames, typeNames, details: new Map(), exhibitionSlug: "sdf-2026", sourceUrl: "https://x.example", collectedAt: "2026-11-17" }),
    ).toThrow();
  });
});
