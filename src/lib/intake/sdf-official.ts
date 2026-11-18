// 서울디자인페스티벌 공식 참가브랜드 명단 → brands.v1. 순수 함수, I/O 없음.
//
// 공식 사이트(seoul.designfestival.co.kr)는 WordPress라 명단이 REST에 있다
// (/wp-json/wp/v2/exhibitor?exhibition_year=<연도 term id>). 소개와 링크는 REST(acf)가 비어 있어
// 브랜드 상세 HTML에서 읽는다. 부스 번호는 사이트 어디에도 없다(2025 기준) — 부스는 배치도가 나온 뒤
// intake.v1로 붙인다(브랜드 먼저, 2026-11-10 결정).
//
// 서울디자인스팟(exhibition_term)은 코엑스 밖 매장 프로그램이라 행사장 부스가 아니다 — 뺀다.
// 이 모듈은 파일을 만들기만 한다. 적용은 사람이 /admin/intake 미리보기를 보고 한다.
import { BRANDS_FILE_VERSION, brandsFileSchema, type BrandsFile, type BrandsFileBrand } from "@/lib/intake/brands-schema";

/** REST 한 줄에서 쓰는 칸. */
export interface SdfRestExhibitor {
  id: number;
  slug: string;
  link: string;
  title: { rendered: string };
  exhibition_term: number[];
  exhibition_type: number[];
  exhibition_year: number[];
}

export interface SdfDetail {
  nameEn: string | null;
  introKo: string | null;
  instagramUrl: string | null;
  websiteUrl: string | null;
}

/** 행사장 밖 프로그램. 이 참가 구분은 명단에서 뺀다. */
export const SDF_OFFSITE_TERMS = ["서울디자인스팟"];

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#039": "'" };
export function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z#0-9]+);/gi, (m, k: string) => ENTITIES[k.toLowerCase()] ?? m);
}
const stripTags = (s: string) => decodeEntities(s.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "")).replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();

/** 상세 HTML에서 영문 이름, 한글 소개, 인스타, 웹 링크를 읽는다. 없으면 null. */
export function parseSdfDetail(html: string): SdfDetail {
  const en = /class="sdf-exhibitor-title-en"[^>]*>([\s\S]*?)<\/span>\s*<\/h1>/.exec(html)?.[1];
  // 소개 칸은 sdf-exhibitor-description부터 사진 칸(없으면 글 끝)까지다.
  const start = html.indexOf('class="sdf-exhibitor-description"');
  const end = start < 0 ? -1 : html.indexOf('class="sdf-exhibitor-images"', start);
  const descHtml = start < 0 ? "" : html.slice(start, end > start ? end : start + 20_000);
  const ko = /<div[^>]*class="[^"]*sdf-ko[^"]*"[^>]*lang="ko"[^>]*>([\s\S]*?)<\/div>/.exec(descHtml)?.[1];
  const paragraphs = ko ? [...ko.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)].map((m) => stripTags(m[1])).filter(Boolean) : [];
  const linksHtml = /<ul class="sdf-brand-links"[^>]*>([\s\S]*?)<\/ul>/.exec(html)?.[1] ?? "";
  const links = [...linksHtml.matchAll(/<li class="([^"]*)"[^>]*>\s*<a href="([^"]+)"/g)].map((m) => ({ cls: m[1], url: decodeEntities(m[2]).trim() }));
  const isIg = (u: string) => /(^|\.)instagram\.com\//i.test(u.replace(/^https?:\/\//, ""));
  const ig = links.find((l) => l.cls.includes("instagram") || isIg(l.url))?.url ?? null;
  const web = links.find((l) => !isIg(l.url) && /^https?:\/\//i.test(l.url))?.url ?? null;
  const nameEn = en ? stripTags(en) : "";
  return {
    nameEn: nameEn || null,
    introKo: paragraphs.length ? paragraphs.join("\n") : null,
    instagramUrl: ig ? normalizeUrl(ig) : null,
    websiteUrl: web ? normalizeUrl(web) : null,
  };
}

function normalizeUrl(u: string): string | null {
  const withScheme = /^https?:\/\//i.test(u) ? u : `https://${u}`;
  try {
    return new URL(withScheme).toString();
  } catch {
    return null;
  }
}

export interface BuildInput {
  rows: SdfRestExhibitor[];
  /** term id → 이름. exhibition_term(참가 구분), exhibition_type(분야). */
  termNames: Map<number, string>;
  typeNames: Map<number, string>;
  /** WP id → 상세. 없는 줄은 이름만 넣는다. */
  details: Map<number, SdfDetail>;
  exhibitionSlug: string | null;
  sourceUrl: string;
  collectedAt: string;
  note?: string;
}

/** 명단 → brands.v1. 서울디자인스팟은 빼고, 뺀 수를 같이 돌려준다. 결과는 스키마로 검사한다. */
export function buildSdfBrandsFile(input: BuildInput): { file: BrandsFile; excluded: { id: number; name: string; term: string }[] } {
  const excluded: { id: number; name: string; term: string }[] = [];
  const brands: BrandsFileBrand[] = [];
  for (const r of input.rows) {
    const name = stripTags(r.title.rendered);
    const terms = r.exhibition_term.map((i) => input.termNames.get(i)).filter((x): x is string => !!x);
    const offsite = terms.find((t) => SDF_OFFSITE_TERMS.includes(t));
    if (offsite) {
      excluded.push({ id: r.id, name, term: offsite });
      continue;
    }
    if (!name) continue;
    const d = input.details.get(r.id);
    const types = r.exhibition_type.map((i) => input.typeNames.get(i)).filter((x): x is string => !!x);
    const category = (types[0] ?? terms[0])?.slice(0, 60);
    const b: BrandsFileBrand = {
      key: `sdf-${r.id}`,
      name: name.slice(0, 120),
      ...(d?.nameEn && d.nameEn.toLowerCase() !== name.toLowerCase() ? { aliases: [d.nameEn.slice(0, 120)] } : {}),
      ...(d?.instagramUrl ? { instagramUrl: d.instagramUrl } : {}),
      ...(d?.websiteUrl ? { websiteUrl: d.websiteUrl } : {}),
      // 주최 측 공식 소개 원문 그대로(브랜드나 주최가 쓴 글은 고치지 않는다, 2026-11-09). 말투 변환은 워커가 한다.
      ...(d?.introKo ? { intro: { text: d.introKo.slice(0, 4000), status: "collected" as const, source: r.link } } : {}),
      ...(category ? { category } : {}),
    };
    brands.push(b);
  }
  const file = brandsFileSchema.parse({
    version: BRANDS_FILE_VERSION,
    exhibitionSlug: input.exhibitionSlug,
    source: { url: input.sourceUrl, collectedAt: input.collectedAt, ...(input.note ? { note: input.note.slice(0, 500) } : {}) },
    brands,
  });
  return { file, excluded };
}
