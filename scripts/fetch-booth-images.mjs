// 부스 대표 이미지를 **브랜드 자기 사이트에서** 받아 로컬에 둔다.
//
//   node scripts/fetch-booth-images.mjs <slug> [--limit N] [--force]
//
// 인스타 CDN은 쓰지 않는다 — URL에 서명 토큰이 붙어 있어 저장해도 몇 시간이면
// 만료되고, 확장도 반환을 막는다. 브랜드가 자기 사이트에 걸어둔 og:image는
// 토큰이 없고 오래 살아 있으며, 무엇보다 **그 브랜드가 스스로 고른 대표 이미지**다.
//
// 결과: public/booths/<slug>/<CODE>.webp + data/verified/<slug>.json 의 image 필드
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import sharp from "sharp";

const [slug, ...rest] = process.argv.slice(2);
if (!slug) { console.error("사용법: node scripts/fetch-booth-images.mjs <slug> [--limit N] [--force]"); process.exit(1); }
const LIMIT = Number(rest[rest.indexOf("--limit") + 1]) || Infinity;
const FORCE = rest.includes("--force");

const intake = JSON.parse(readFileSync(`data/intake/${slug}.json`, "utf8"));
const vPath = `data/verified/${slug}.json`;
const verified = existsSync(vPath)
  ? JSON.parse(readFileSync(vPath, "utf8"))
  : { exhibitionSlug: slug, booths: {} };
const OUT = `public/booths/${slug}`;
mkdirSync(OUT, { recursive: true });

const UA = { "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36" };
const abs = (u, base) => { try { return new URL(u, base).toString(); } catch { return null; } };

/** 브랜드가 스스로 고른 대표 이미지를 순서대로 찾는다. */
function pickImage(html, base) {
  const meta = (p) => html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${p}["'][^>]+content=["']([^"']+)`, "i"))?.[1]
    ?? html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${p}["']`, "i"))?.[1];
  const cands = [meta("og:image"), meta("twitter:image")].filter(Boolean);
  if (!cands.length) {
    // og가 없으면 본문에서 가장 먼저 나오는 큰 이미지를 쓴다.
    for (const m of html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)) {
      const u = m[1];
      if (/logo|icon|sprite|blank|1x1|pixel/i.test(u)) continue;
      cands.push(u);
      if (cands.length >= 3) break;
    }
  }
  return cands.map((u) => abs(u, base)).filter(Boolean);
}

const targets = intake.booths
  .filter((b) => b.kind !== "facility" && b.websiteUrl)
  .filter((b) => FORCE || !existsSync(`${OUT}/${b.code}.webp`))
  .slice(0, LIMIT);
console.log(`${slug} · 대상 ${targets.length}곳`);

let ok = 0, noImg = 0, err = 0;
const CONC = 5;
async function one(b) {
  try {
    const res = await fetch(b.websiteUrl, { headers: UA, signal: AbortSignal.timeout(15000), redirect: "follow" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    const urls = pickImage(html, res.url);
    if (!urls.length) { noImg++; return; }
    for (const u of urls) {
      try {
        const r = await fetch(u, { headers: { ...UA, referer: res.url }, signal: AbortSignal.timeout(15000) });
        if (!r.ok) continue;
        const buf = Buffer.from(await r.arrayBuffer());
        if (buf.length < 2000) continue;               // 스페이서·아이콘 거르기
        await sharp(buf)
          .resize(640, 640, { fit: "cover", position: "attention" })
          .webp({ quality: 74 })
          .toFile(`${OUT}/${b.code}.webp`);
        verified.booths[b.code] ??= { summary: "" };
        verified.booths[b.code].image = `/booths/${slug}/${b.code}.webp`;
        ok++;
        console.log(`  ✓ ${b.code} ${b.name}`);
        return;
      } catch { /* 다음 후보 */ }
    }
    noImg++;
  } catch (e) {
    err++;
    console.log(`  ! ${b.code} ${b.name} — ${String(e.message).slice(0, 50)}`);
  }
}
for (let i = 0; i < targets.length; i += CONC)
  await Promise.all(targets.slice(i, i + CONC).map(one));

writeFileSync(vPath, JSON.stringify(verified, null, 1));
console.log(`\n받음 ${ok} · 이미지 못 찾음 ${noImg} · 접속 실패 ${err} → ${OUT}`);
