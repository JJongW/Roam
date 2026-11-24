/**
 * 서울디자인페스티벌 공식 참가브랜드 명단 → brands.v1 파일.
 *
 *   npm run brands:sdf -- <연도 term id> --slug <행사 slug|none> --out <파일.json> [--term <참가 구분 slug>] [--raw <원본.json>] [--no-details]
 *                         [--no-photos] [--max-photos <N, 기본 6>]
 *
 *   연도 term id: 2025 = 24, 2026 = 37(2026-11-19 기준 140건)
 *   --term: 목록 화면 `?_sdf_category=<slug>`와 같은 값. 01-design-brand(디자인브랜드, term id 5),
 *           02-young-design(영 디자이너 프로모션, 18), 03-design-specialist(디자인 스페셜리스트, 31).
 *           주면 그 구분만 파일에 넣고, 나머지 구분은 수만 찍는다. 대응표는 sdf-official.ts SDF_TERM_SLUGS.
 *
 * 공식 WP REST(seoul.designfestival.co.kr/wp-json/wp/v2/exhibitor)로 명단을 받고, 소개와 링크는
 * REST에 없어 브랜드 상세 HTML을 읽는다(같은 호스트에 1초 간격, robots.txt는 /wp-admin/만 막음).
 * 서울디자인스팟(행사장 밖 매장 프로그램)은 뺀다. 변환은 src/lib/intake/sdf-official.ts(순수, 테스트 있음).
 *
 * **공개 사진**(2026-11-24 Ted "서비스에 들어가는 건 공개로 올라와 있는 건 다 받아 놓으라"): 상세의 작품 사진(없으면
 * 대표 사진)을 같은 사이트에서만 받아 `public/booths/<slug>/<key>_<해시8>.webp`(긴 변 640, 새해 준비상점과 같은 크기)로
 * 두고 photos 칸에 넣는다. 로고, 아이콘, 배너, 여러 브랜드에 똑같이 걸린 그림, 투명 배경 그림, 너무 작은 그림은 뺀다.
 * 파일 이름이 원본 이름의 해시라 다시 돌리면 있는 파일은 다시 받지 않고, 사이트에서 빠진 사진 파일은 지운다.
 * 부스 상세(서비스)용이다. 아티클과 카드뉴스는 허락 사진만 쓴다(2026-11-19) — 이 사진을 거기 쓰지 않는다.
 *
 * **파일만 만든다.** 운영 DB에 쓰지 않는다. 적용은 사람이 /admin/intake 미리보기를 보고 한다
 * (2026-11-17 라운드 테이블 "지금" 7번). 인스타는 공식 사이트가 건 링크만 쓴다 — 인스타를 긁지 않는다.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import sharp from "sharp";
import {
  SDF_FLAT_LOGO,
  SDF_MAX_PHOTOS,
  SDF_OFFSITE_TERMS,
  SDF_TERM_SLUGS,
  buildSdfBrandsFile,
  decodeEntities,
  parseSdfDetail,
  pickSdfPhotoUrls,
  sdfCommonPhotos,
  sdfPhotoIdentity,
  type SdfDetail,
  type SdfRestExhibitor,
} from "@/lib/intake/sdf-official";

const BASE = "https://seoul.designfestival.co.kr/wp-json/wp/v2";
// 공식 사이트가 일반 브라우저 UA가 아니면 막는 경우가 있어 평범한 UA를 쓴다(조회만, 1초 간격).
const UA = "Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/130 Safari/537.36";
const GAP_MS = 1000;

const argv = process.argv.slice(2).filter((a) => a !== "--");
const yearId = Number(argv[0]);
const opt = (name: string) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};
const slugArg = opt("--slug");
const out = opt("--out");
const rawOut = opt("--raw");
const termSlug = opt("--term");
const details = !argv.includes("--no-details");
const maxPhotos = Number(opt("--max-photos") ?? SDF_MAX_PHOTOS);
if (!Number.isInteger(yearId) || yearId <= 0 || !slugArg || !out || !Number.isInteger(maxPhotos) || maxPhotos < 1 || maxPhotos > 20) {
  console.error(
    "사용법: npm run brands:sdf -- <연도 term id> --slug <행사 slug|none> --out <파일.json> [--term <참가 구분 slug>] [--raw <원본.json>] [--no-details] [--no-photos] [--max-photos <1~20>]",
  );
  process.exit(1);
}
const exhibitionSlug = slugArg === "none" ? null : slugArg;
// 사진은 행사 폴더에 둔다. 행사가 없거나(none) 상세를 안 읽으면 받지 않는다.
const photosOn = details && !!exhibitionSlug && !argv.includes("--no-photos");

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let last = 0;
async function get(url: string): Promise<Response> {
  const wait = last + GAP_MS - Date.now();
  if (wait > 0) await sleep(wait);
  last = Date.now();
  const res = await fetch(url, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res;
}

const termSlugs = new Map<number, string>();
async function terms(tax: string): Promise<Map<number, string>> {
  const rows = (await (await get(`${BASE}/${tax}?per_page=100`)).json()) as { id: number; slug: string; name: string }[];
  if (tax === "exhibition_term") for (const t of rows) termSlugs.set(t.id, t.slug);
  return new Map(rows.map((t) => [t.id, decodeEntities(t.name)]));
}

const [years, termNames, typeNames] = [await terms("exhibition_year"), await terms("exhibition_term"), await terms("exhibition_type")];
let onlyTerms: string[] | undefined;
if (termSlug) {
  const id = [...termSlugs].find(([, s]) => s === termSlug)?.[0];
  if (id === undefined) {
    console.error(`✗ 참가 구분 ${termSlug}를 찾지 못했어요. 있는 값: ${[...termSlugs.values()].join(", ")}`);
    process.exit(1);
  }
  const name = termNames.get(id)!;
  if (SDF_TERM_SLUGS[termSlug] && SDF_TERM_SLUGS[termSlug] !== name) console.warn(`  사이트 이름이 바뀌었어요: ${termSlug} = ${name}`);
  onlyTerms = [name];
  console.log(`참가 구분 ${termSlug} = ${name} (term id ${id})만 넣어요`);
}
if (!years.has(yearId)) {
  console.error(`✗ 연도 term id ${yearId}를 찾지 못했어요. 있는 값: ${[...years].map(([id, n]) => `${n}=${id}`).join(", ")}`);
  process.exit(1);
}

const sourceUrl = `${BASE}/exhibitor?exhibition_year=${yearId}`;
const rows: SdfRestExhibitor[] = [];
for (let page = 1; ; page++) {
  const res = await get(`${sourceUrl}&per_page=100&page=${page}&orderby=id&order=asc`);
  const items = (await res.json()) as SdfRestExhibitor[];
  rows.push(...items);
  const totalPages = Number(res.headers.get("x-wp-totalpages") ?? 1);
  if (!items.length || page >= totalPages) break;
}
console.log(`${years.get(yearId)}년 명단 ${rows.length}건`);
if (!rows.length) {
  console.error("✗ 명단이 아직 비어 있어요. 파일을 만들지 않았어요");
  process.exit(1);
}

const offsite = new Set([...termNames].filter(([, n]) => SDF_OFFSITE_TERMS.includes(n)).map(([id]) => id));
const scope = onlyTerms ? new Set([...termNames].filter(([, n]) => onlyTerms!.includes(n)).map(([id]) => id)) : null;
const want = rows.filter((r) => !r.exhibition_term.some((t) => offsite.has(t)) && (!scope || r.exhibition_term.some((t) => scope.has(t))));
const detailMap = new Map<number, SdfDetail>();
if (details) {
  for (const [i, r] of want.entries()) {
    try {
      detailMap.set(r.id, parseSdfDetail(await (await get(r.link)).text()));
    } catch (e) {
      console.warn(`  상세를 못 읽었어요(이름만 넣어요): ${r.link} ${e instanceof Error ? e.message : e}`);
    }
    if ((i + 1) % 25 === 0) console.log(`  상세 ${i + 1}/${want.length}`);
  }
}

/**
 * 받은 그림이 사진이 아니면 이유를 돌려준다. 64x64로 줄여 센다.
 * - 투명한 칸이 10% 넘으면 로고로 본다(투명 PNG 로고). 가장자리 몇 칸만 투명한 작품 그림은 남긴다.
 * - 대표 사진(작품 사진이 없어 대신 쓰는 것)은 네 귀퉁이 바탕색과 같은 칸이 SDF_FLAT_LOGO를 넘으면 로고로 본다.
 */
async function notPhotoReason(buf: Buffer, hero: boolean): Promise<string | null> {
  const meta = await sharp(buf).metadata();
  if (!meta.width || !meta.height) return "크기를 못 읽음";
  if (Math.max(meta.width, meta.height) < 300) return `너무 작음 ${meta.width}x${meta.height}`;
  const N = 64 * 64;
  if (meta.hasAlpha) {
    const { data } = await sharp(buf).resize(64, 64, { fit: "fill" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let clear = 0;
    for (let i = 0; i < N; i++) if (data[i * 4 + 3] < 128) clear++;
    if (clear / N > 0.1) return "투명 배경(로고로 봄)";
  }
  if (hero) {
    const { data } = await sharp(buf).resize(64, 64, { fit: "fill" }).flatten({ background: "#ffffff" }).raw().toBuffer({ resolveWithObject: true });
    const px = (i: number) => [data[i * 3], data[i * 3 + 1], data[i * 3 + 2]];
    const corners = [0, 63, 64 * 63, N - 1].map(px);
    const bg = [0, 1, 2].map((c) => corners.reduce((sum, p) => sum + p[c], 0) / 4);
    let flat = 0;
    for (let i = 0; i < N; i++) {
      const p = px(i);
      if (Math.hypot(p[0] - bg[0], p[1] - bg[1], p[2] - bg[2]) < 30) flat++;
    }
    if (flat / N > SDF_FLAT_LOGO) return "대표 그림이 단색 바탕(로고로 봄)";
  }
  return null;
}

const photoMap = new Map<number, string[]>();
const zeroPhoto: { name: string; reason: string }[] = [];
let photoFiles = 0;
let photoNew = 0;
let photoRemoved = 0;
if (photosOn) {
  const dir = join("public", "booths", exhibitionSlug!);
  mkdirSync(dir, { recursive: true });
  const common = sdfCommonPhotos(detailMap.values());
  if (common.size) console.log(`  여러 브랜드에 똑같이 걸린 그림 ${common.size}개는 사이트 공통으로 보고 빼요`);
  const keep = new Set<string>();
  for (const [i, r] of want.entries()) {
    const key = `sdf-${r.id}`;
    const name = decodeEntities(r.title.rendered);
    const d = detailMap.get(r.id);
    if (!d) {
      zeroPhoto.push({ name, reason: "상세를 못 읽음" });
      continue;
    }
    const urls = pickSdfPhotoUrls(d, { max: maxPhotos + 2, common });
    if (!urls.length) {
      zeroPhoto.push({ name, reason: d.heroUrl || d.imageUrls.length ? "사진이 전부 로고, 공통 그림, 다른 사이트" : "상세에 사진 없음" });
      continue;
    }
    const paths: string[] = [];
    const skipped: string[] = [];
    for (const url of urls) {
      if (paths.length >= maxPhotos) break;
      const fileName = `${key}_${createHash("sha256").update(sdfPhotoIdentity(url)).digest("hex").slice(0, 8)}.webp`;
      const filePath = join(dir, fileName);
      const hero = !d.imageUrls.some((w) => sdfPhotoIdentity(w) === sdfPhotoIdentity(url));
      try {
        // 있는 파일은 다시 받지 않고, 거르는 규칙만 다시 건다(규칙이 바뀌어도 맞게).
        const had = existsSync(filePath);
        const buf = had ? readFileSync(filePath) : Buffer.from(await (await get(url)).arrayBuffer());
        const why = await notPhotoReason(buf, hero);
        if (why) {
          skipped.push(why);
          continue;
        }
        if (!had) {
          await sharp(buf).rotate().resize(640, 640, { fit: "inside", withoutEnlargement: true }).webp({ quality: 78 }).toFile(filePath);
          photoNew++;
        }
      } catch (e) {
        skipped.push(`받기 실패 ${e instanceof Error ? e.message : e}`);
        continue;
      }
      keep.add(fileName);
      paths.push(`/booths/${exhibitionSlug}/${fileName}`);
    }
    if (paths.length) {
      photoMap.set(r.id, paths);
      photoFiles += paths.length;
    } else zeroPhoto.push({ name, reason: skipped.join(", ") || "받을 사진 없음" });
    if ((i + 1) % 25 === 0) console.log(`  사진 ${i + 1}/${want.length}`);
  }
  // 이번에 다룬 브랜드의 옛 파일 중 사이트에서 빠진 것만 지운다(다른 행사, 다른 이름 파일은 건드리지 않는다).
  const handled = new Set(want.map((r) => `sdf-${r.id}`));
  for (const f of readdirSync(dir)) {
    const m = /^(sdf-\d+)_[0-9a-f]{8}\.webp$/.exec(f);
    if (m && handled.has(m[1]) && !keep.has(f)) {
      rmSync(join(dir, f));
      photoRemoved++;
    }
  }
}

const today = new Date().toISOString().slice(0, 10);
const { file, excluded, outOfScope } = buildSdfBrandsFile({
  rows,
  termNames,
  typeNames,
  details: detailMap,
  exhibitionSlug,
  sourceUrl,
  collectedAt: today,
  onlyTerms,
  ...(photosOn ? { photos: photoMap, photoScope: `주최 측 사이트 공개 사진(서울디자인페스티벌 ${years.get(yearId)})` } : {}),
  note: onlyTerms
    ? `서울디자인페스티벌 ${years.get(yearId)} 공식 참가브랜드 중 ${onlyTerms.join(", ")}(${termSlug})만 넣었어요(WP REST + 상세 페이지). 서울디자인스팟은 행사장 밖 프로그램이라 뺐어요. 부스 번호는 사이트에 없어요`
    : `서울디자인페스티벌 ${years.get(yearId)} 공식 참가브랜드(WP REST + 상세 페이지). 서울디자인스팟은 행사장 밖 프로그램이라 뺐어요. 부스 번호는 사이트에 없어요`,
});
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(file, null, 2)}\n`);
if (rawOut) {
  mkdirSync(dirname(rawOut), { recursive: true });
  writeFileSync(rawOut, `${JSON.stringify({ sourceUrl, fetchedAt: today, rows, details: Object.fromEntries(detailMap) }, null, 1)}\n`);
}
const withIg = file.brands.filter((b) => b.instagramUrl).length;
const withIntro = file.brands.filter((b) => b.intro).length;
console.log(`✓ brands.v1 ${file.brands.length}곳 → ${out} (서울디자인스팟 ${excluded.length}곳 뺌, 인스타 ${withIg}, 소개 ${withIntro})`);
if (photosOn) {
  console.log(`  사진 ${photoMap.size}곳 ${photoFiles}장(새로 받음 ${photoNew}, 지움 ${photoRemoved}) → public/booths/${exhibitionSlug}/`);
  if (zeroPhoto.length) console.log(`  사진 0인 곳 ${zeroPhoto.length}: ${zeroPhoto.map((z) => `${z.name}(${z.reason})`).join(", ")}`);
}
if (outOfScope.length) {
  const byTerm = new Map<string, number>();
  for (const o of outOfScope) for (const t of o.terms.length ? o.terms : ["(구분 없음)"]) byTerm.set(t, (byTerm.get(t) ?? 0) + 1);
  console.log(`  범위 밖이라 안 넣은 곳 ${outOfScope.length}: ${[...byTerm].map(([t, n]) => `${t} ${n}`).join(", ")}`);
}
console.log("  운영 DB에는 쓰지 않았어요. /admin/intake에 올려 미리보기를 보고 적용해 주세요");
