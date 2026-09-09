// 주최 디렉터리(brands-online.json)에 브랜드가 직접 올린 제품 이미지를 내려받는다.
//
//   node scripts/fetch-magok-organizer-images.mjs [--dry]
//
// 이미지가 아직 없는 부스만 대상. brand_image1~4_url 은 절대 CDN URL이라
// 서명 토큰이 없고 오래 산다. 결과: public/booths/magok-livingmarket-2026/<CODE>_N.webp
// + data/verified/<slug>.json 의 images 배열.
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import sharp from "sharp";

const SLUG = "magok-livingmarket-2026";
const DRY = process.argv.includes("--dry");
const OUT = `public/booths/${SLUG}`;

const intake = JSON.parse(readFileSync(`data/intake/${SLUG}.json`, "utf8"));
const vPath = `data/verified/${SLUG}.json`;
const verified = JSON.parse(readFileSync(vPath, "utf8"));
const online = JSON.parse(readFileSync("data/magok-livingmarket/brands-online.json", "utf8")).prodList;

const have = new Set(readdirSync(OUT).map((f) => f.replace(/(_\d+)?\.webp$/, "")));
const missing = intake.booths.filter((b) => b.kind !== "facility" && !have.has(b.code));

const norm = (s) => (s || "").replace(/[\s()[\]\-/·.,"']/g, "").replace(/주식회사|㈜/g, "").toLowerCase();
const urlsOf = (x) => [1, 2, 3, 4].flatMap((i) => x[`brand_image${i}_url`] ?? []).map((o) => o.url).filter(Boolean);
const pool = online.map((x) => ({ name: x.brand_name_kor ?? "", key: norm(x.brand_name_kor), urls: urlsOf(x) }));

const UA = { "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36" };

const report = { ok: [], noMatch: [], noImage: [], rejected: [] };

for (const b of missing) {
  const k = norm(b.name);
  const hit = pool.find((q) => q.key && q.key === k)
    ?? pool.find((q) => q.key.length > 2 && (q.key.includes(k) || k.includes(q.key)));
  if (!hit) { report.noMatch.push(b.code); continue; }
  if (!hit.urls.length) { report.noImage.push(`${b.code}(${hit.name})`); continue; }

  const saved = [];
  for (const u of hit.urls) {
    const n = saved.length + 1;
    try {
      const r = await fetch(u, { headers: UA, signal: AbortSignal.timeout(20000) });
      if (!r.ok) { report.rejected.push(`${b.code} HTTP ${r.status}`); continue; }
      const buf = Buffer.from(await r.arrayBuffer());
      const meta = await sharp(buf).metadata();
      // 1x1 스페이서·아이콘·404 HTML 거르기
      if (buf.length < 2000 || (meta.width ?? 0) < 200 || (meta.height ?? 0) < 200) {
        report.rejected.push(`${b.code} 너무 작음 ${meta.width}x${meta.height} ${buf.length}B`);
        continue;
      }
      const file = `${OUT}/${b.code}_${n}.webp`;
      if (existsSync(file)) continue;                    // 기존 파일은 절대 덮지 않는다
      if (!DRY) await sharp(buf).rotate().resize(640, 640, { fit: "cover", position: "attention" }).webp({ quality: 78 }).toFile(file);
      saved.push(`/booths/${SLUG}/${b.code}_${n}.webp`);
    } catch (e) {
      report.rejected.push(`${b.code} ${e.message}`);
    }
  }
  if (!saved.length) { report.noImage.push(`${b.code}(${hit.name}) 전부 탈락`); continue; }
  verified.booths[b.code] ??= { summary: "" };
  verified.booths[b.code].images = saved;
  report.ok.push(`${b.code} ${b.name} ×${saved.length}`);
}

if (!DRY) writeFileSync(vPath, JSON.stringify(verified, null, 1));
console.log(`대상 ${missing.length}곳 · 확보 ${report.ok.length}곳`);
for (const [k, v] of Object.entries(report)) if (v.length) console.log(`\n[${k}] ${v.length}\n  ${v.join("\n  ")}`);
