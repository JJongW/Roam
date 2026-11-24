import { describe, expect, it } from "vitest";
import { buildSdfBrandsFile, parseSdfDetail, pickSdfCategory, pickSdfPhotoUrls, sdfCommonPhotos, sdfPhotoIdentity, type SdfRestExhibitor } from "./sdf-official";

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
<div class="gb-element-1ebc5bb9 sdf-exhibitor-visual">
<img fetchpriority="high" width="1024" height="1024" class="gb-media-1" src="https://seoul.designfestival.co.kr/wp-content/uploads/2026/11/hero-1024x1024.jpg" alt="조각모음" />
</div>
<ul class="sdf-brand-links"><li class="is-instagram"><a href="https://www.instagram.com/jogakmoeum_vol.1" target="_blank">ig</a></li><li class="is-website"><a href="https://jogak.example/" target="_blank">web</a></li></ul>
</article>`;

describe("SDF 상세 읽기", () => {
  it("영문 이름, 한글 소개 문단, 인스타와 웹 링크를 읽어요", () => {
    expect(parseSdfDetail(DETAIL)).toEqual({
      nameEn: "jogakmoeum",
      introKo: "과거와 현재를 담은 을지로의 아늑한 공간, 조각모음.\n취향과 취미의 조각을 모아\n작은 이야기를 전하는 소품 숍이다.",
      instagramUrl: "https://www.instagram.com/jogakmoeum_vol.1",
      websiteUrl: "https://jogak.example/",
      imageUrls: ["https://x/a.png"],
      heroUrl: "https://seoul.designfestival.co.kr/wp-content/uploads/2026/11/hero-1024x1024.jpg",
    });
  });

  it("칸이 없으면 null이에요", () => {
    expect(parseSdfDetail("<html></html>")).toEqual({ nameEn: null, introKo: null, instagramUrl: null, websiteUrl: null, imageUrls: [], heroUrl: null });
  });
});

describe("SDF 공개 사진 고르기", () => {
  const up = (name: string) => `https://seoul.designfestival.co.kr/wp-content/uploads/2026/11/${name}`;

  it("작품 사진을 순서대로 고르고, 같은 원본은 한 번만 골라요. 작품이 있으면 대표 사진(로고가 많음)은 안 써요", () => {
    const got = pickSdfPhotoUrls({ heroUrl: up("a-1024x1024.jpg"), imageUrls: [up("b-819x1024.jpg"), up("b-768x960.jpg"), up("c.png")] });
    expect(got).toEqual([up("b-819x1024.jpg"), up("c.png")]);
  });

  it("작품 사진이 없을 때만 대표 사진을 써요", () => {
    expect(pickSdfPhotoUrls({ heroUrl: up("a-1024x1024.jpg"), imageUrls: [] })).toEqual([up("a-1024x1024.jpg")]);
    expect(pickSdfPhotoUrls({ heroUrl: up("a.jpg"), imageUrls: [up("brand-logo.png")] })).toEqual([up("a.jpg")]);
  });

  it("다른 사이트, 테마 그림, svg, 로고와 배너 이름은 빼요", () => {
    const got = pickSdfPhotoUrls({
      heroUrl: null,
      imageUrls: [
        "https://cdn.example.com/wp-content/uploads/x.jpg",
        "https://seoul.designfestival.co.kr/wp-content/themes/generatepress_child/assets/icons/link-instagram.svg",
        up("sdf-wordmark.svg"),
        up("brand-logo.png"),
        up("main_banner.jpg"),
        up("world-design-weeks.png"),
        up("work.webp"),
      ],
    });
    expect(got).toEqual([up("work.webp")]);
  });

  it("상한까지만 받아요", () => {
    const many = Array.from({ length: 10 }, (_, i) => up(`w${i}.jpg`));
    expect(pickSdfPhotoUrls({ heroUrl: null, imageUrls: many }, { max: 3 })).toHaveLength(3);
    expect(pickSdfPhotoUrls({ heroUrl: null, imageUrls: many })).toHaveLength(6);
  });

  it("여러 브랜드에 똑같이 걸린 사진은 사이트 공통 그림으로 보고 빼요", () => {
    const shared = up("default-1024x1024.jpg");
    const details = [1, 2, 3].map((i) => ({ heroUrl: null, imageUrls: [shared, up(`own${i}.jpg`)] }));
    const common = sdfCommonPhotos(details);
    expect(common.has(sdfPhotoIdentity(shared))).toBe(true);
    expect(pickSdfPhotoUrls(details[0], { common })).toEqual([up("own1.jpg")]);
    expect(sdfCommonPhotos(details.slice(0, 2)).size).toBe(0);
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
    expect(file.brands[1]).toEqual({ key: "sdf-3", name: "Studio & Co", category: "디자인브랜드", participationType: "디자인브랜드" });
  });

  it("받아 둔 사진이 있으면 photos 칸에 허락 범위와 함께 넣어요", () => {
    const { file } = buildSdfBrandsFile({
      rows: [row(1, "모스", 16), row(3, "조각모음", 16)],
      termNames,
      typeNames,
      details: new Map(),
      exhibitionSlug: "sdf-2026",
      sourceUrl: "https://seoul.designfestival.co.kr/wp-json/wp/v2/exhibitor?exhibition_year=37",
      collectedAt: "2026-11-24",
      photos: new Map([
        [1, ["/booths/sdf-2026/sdf-1_1.webp", "/booths/sdf-2026/sdf-1_2.webp"]],
        [3, []],
      ]),
      photoScope: "주최 측 사이트 공개 사진(서울디자인페스티벌 2026)",
    });
    expect(file.brands[0].photos).toEqual([
      { path: "/booths/sdf-2026/sdf-1_1.webp", scope: "주최 측 사이트 공개 사진(서울디자인페스티벌 2026)" },
      { path: "/booths/sdf-2026/sdf-1_2.webp", scope: "주최 측 사이트 공개 사진(서울디자인페스티벌 2026)" },
    ]);
    expect(file.brands[1].photos).toBeUndefined();
  });

  it("명단이 비면(2026 아직 미공개) 만들지 않아요", () => {
    expect(() =>
      buildSdfBrandsFile({ rows: [], termNames, typeNames, details: new Map(), exhibitionSlug: "sdf-2026", sourceUrl: "https://x.example", collectedAt: "2026-11-17" }),
    ).toThrow();
  });

  it("참가 구분을 고르면 그 구분만 넣고 나머지는 outOfScope로 돌려줘요", () => {
    const names = new Map([...termNames, [18, "영 디자이너 프로모션"]]);
    const { file, outOfScope } = buildSdfBrandsFile({
      rows: [row(1, "모스", 16, [30]), row(4, "육주영", 18), row(2, "조각모음", 19)],
      termNames: names,
      typeNames,
      details: new Map(),
      exhibitionSlug: "sdf-2026",
      sourceUrl: "https://x.example",
      collectedAt: "2026-11-19",
      onlyTerms: ["디자인브랜드"],
    });
    expect(file.brands.map((b) => b.key)).toEqual(["sdf-1"]);
    expect(outOfScope).toEqual([{ id: 4, name: "육주영", terms: ["영 디자이너 프로모션"] }]);
  });
});

describe("SDF 분류 고르기", () => {
  it("분야가 여럿이면 구역형 분야를 먼저 골라요", () => {
    expect(pickSdfCategory(["리빙", "아트&크래프트", "디자인&크래프트 무브먼트"], ["디자인브랜드"])).toBe("디자인&크래프트 무브먼트");
  });
  it("구역이 없으면 첫 분야, 분야도 없으면 참가 구분이에요", () => {
    expect(pickSdfCategory(["리빙", "아트&크래프트"], ["디자인브랜드"])).toBe("리빙");
    expect(pickSdfCategory([], ["디자인브랜드"])).toBe("디자인브랜드");
  });
});
