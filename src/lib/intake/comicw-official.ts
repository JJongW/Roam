// 코믹월드(comicw.net) 문구전 공식 참가 명단 → brands.v1. 순수 함수, I/O 없음.
//
// 공식 원천 두 쪽(로그인 없이 보이는 공개 페이지):
// - 행사장 배치도 `moongu/booth_map.php?fare_id=<회차>`: "확정 부스번호 목록". 이름과 번호. 요일은 없다.
//   번호 칸에 둘 이상이 붙어 오기도 한다("CB_15 CB_16" = 테이블 두 개). 같은 번호를 두 이름이 나눠 쓰기도 한다(토, 일 나눔으로 보임).
// - 부스컷 목록 `g/boothcut/?fare=<회차>`: 부스컷을 올린 팀만. 요일 패널(d0 = 첫날, d1 = 둘째 날)과 상세 id(`/g/<id>`).
// 명단의 뿌리는 배치도 목록이다. 부스컷은 요일과 상세 주소를 덧붙이는 데만 쓴다.
//
// 부스 번호와 요일은 brands.v1에 칸이 없다 → 옆 파일(booths)로 남겨 두고, 배치도가 나오면 intake.v1을 만들 때 쓴다
// (브랜드 먼저, 부스는 나중, 2026-11-17 Ted 결정).
import { BRANDS_FILE_VERSION, brandsFileSchema, type BrandsFile, type BrandsFileBrand } from "@/lib/intake/brands-schema";
import { flatName } from "@/lib/exhibitor/identity";

export interface ComicwListEntry {
  /** 공식 표기 그대로. 예: "CB_15 CB_16" */
  codes: string[];
  name: string;
}

export interface ComicwBoothcut {
  day: string;
  id: string;
  /** 문구B, 문구C */
  spec: string;
  code: string;
  name: string;
}

const decode = (s: string) =>
  s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .trim();

/** 행사장 배치도 페이지의 "확정 부스번호 목록". */
export function parseBoothMapList(html: string): { entries: ComicwListEntry[]; declaredCount: number | null; mapReady: boolean } {
  const entries = [...html.matchAll(/<span class="mgbm-num">([^<]+)<\/span>\s*<span class="mgbm-name">([^<]*)<\/span>/g)].map((m) => ({
    codes: decode(m[1]).split(/\s+/).filter(Boolean),
    name: decode(m[2]),
  }));
  const count = html.match(/id="mgbm-count">\s*(\d+)\s*개/);
  return {
    entries: entries.filter((e) => e.name),
    declaredCount: count ? Number(count[1]) : null,
    // 그림이 없으면 "배치도를 준비하고 있습니다."가 mgbm-empty에 들어 있다.
    mapReady: !/class="mgbm-empty"/.test(html),
  };
}

/** 부스컷 목록의 요일 패널 카드. */
export function parseBoothcutList(html: string): ComicwBoothcut[] {
  const out: ComicwBoothcut[] = [];
  const panels = html.split(/<div class="bc-day-panel" data-day="(d\d+)"/);
  for (let i = 1; i < panels.length; i += 2) {
    const day = panels[i];
    for (const m of panels[i + 1].matchAll(
      /<a class="bc-card" href="\/g\/(\d+)"\s+data-spec="([^"]*)"[\s\S]*?<div class="bc-booth-num">([^<]*)<\/div>[\s\S]*?<div class="bc-booth-name">([^<]*)<\/div>/g,
    ))
      out.push({ day, id: m[1], spec: decode(m[2]), code: decode(m[3]), name: decode(m[4]) });
  }
  return out;
}

export interface BoothSidecarRow {
  key: string;
  name: string;
  /** 공식 번호(밑줄 없앤 꼴, 예: CB15). 둘 이상이면 테이블 여럿. */
  codes: string[];
  /** 부스컷이 있는 팀만. 첫날 sat, 둘째 날 sun. 없으면 모름. */
  days?: ("sat" | "sun")[];
  boothcutUrl?: string;
  spec?: string;
  /** 같은 번호를 다른 이름과 나눠 쓴다(요일 나눔으로 보임). */
  sharesCodeWith?: string[];
}

export interface ComicwBuildInput {
  entries: ComicwListEntry[];
  boothcuts: ComicwBoothcut[];
  exhibitionSlug: string | null;
  sourceUrl: string;
  collectedAt: string;
  /** 회차 첫날, 둘째 날 이름. */
  dayNames?: Record<string, "sat" | "sun">;
  /** 이름(flatName) → 확인된 인스타 주소. 공식 작가 페이지나 부스컷에서 사람이 확인한 것만. */
  instagram?: Map<string, string>;
  /** 이름(flatName) → 사람이 같은 브랜드라고 확인한 운영 브랜드 id. */
  exhibitorIds?: Map<string, string>;
  keyPrefix: string;
  note: string;
}

export const normCode = (c: string) => c.replace(/_/g, "").toUpperCase();

/** 짧은 이름 지문(FNV-1a 32비트, 16진 6자). 같은 번호를 나눠 쓰는 두 이름의 열쇠를 가른다. */
function nameTag(s: string): string {
  let h = 0x811c9dc5;
  for (const ch of s) {
    h ^= ch.codePointAt(0)!;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0").slice(0, 6);
}

export function buildComicwBrandsFile(input: ComicwBuildInput): { file: BrandsFile; booths: BoothSidecarRow[]; duplicates: string[] } {
  const dayNames = input.dayNames ?? { d0: "sat", d1: "sun" };
  const cutsByName = new Map<string, ComicwBoothcut[]>();
  for (const c of input.boothcuts) {
    const k = flatName(c.name);
    (cutsByName.get(k) ?? cutsByName.set(k, []).get(k)!).push(c);
  }
  const namesByCode = new Map<string, string[]>();
  for (const e of input.entries) for (const c of e.codes.map(normCode)) (namesByCode.get(c) ?? namesByCode.set(c, []).get(c)!).push(e.name);

  const seen = new Set<string>();
  const duplicates: string[] = [];
  const brands: BrandsFileBrand[] = [];
  const booths: BoothSidecarRow[] = [];
  for (const e of input.entries) {
    const fk = flatName(e.name);
    if (seen.has(fk || e.name)) {
      duplicates.push(e.name);
      continue;
    }
    seen.add(fk || e.name);
    const cuts = cutsByName.get(fk) ?? [];
    const gid = cuts[0]?.id;
    // 열쇠: 부스컷 상세 id가 있으면 그것(이름이 바뀌어도 같다), 없으면 첫 번호 + 이름 지문
    // (같은 번호를 토, 일로 나눠 쓰는 두 이름이 있어 번호만으로는 겹친다).
    const key = `${input.keyPrefix}-${gid ? `g${gid}` : `${normCode(e.codes[0] ?? "x").toLowerCase()}-${nameTag(fk || e.name)}`}`;
    const ig = input.instagram?.get(fk);
    const exhibitorId = input.exhibitorIds?.get(fk);
    const spec = cuts[0]?.spec;
    brands.push({
      key,
      name: e.name.slice(0, 120),
      ...(exhibitorId ? { exhibitorId } : {}),
      ...(ig ? { instagramUrl: ig } : {}),
      ...(spec ? { participationType: spec.slice(0, 60) } : {}),
    });
    const codes = e.codes.map(normCode);
    const days = [...new Set(cuts.map((c) => dayNames[c.day]).filter((d): d is "sat" | "sun" => !!d))].sort((a, b) => (a === "sat" ? -1 : b === "sat" ? 1 : 0));
    const shares = [...new Set(codes.flatMap((c) => namesByCode.get(c) ?? []).filter((n) => n !== e.name))];
    booths.push({
      key,
      name: e.name,
      codes,
      ...(days.length ? { days } : {}),
      ...(gid ? { boothcutUrl: `https://comicw.net/g/${gid}` } : {}),
      ...(spec ? { spec } : {}),
      ...(shares.length ? { sharesCodeWith: shares } : {}),
    });
  }
  const file = brandsFileSchema.parse({
    version: BRANDS_FILE_VERSION,
    exhibitionSlug: input.exhibitionSlug,
    source: { url: input.sourceUrl, collectedAt: input.collectedAt, note: input.note },
    brands,
  });
  return { file, booths, duplicates };
}
