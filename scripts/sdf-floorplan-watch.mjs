#!/usr/bin/env node
/**
 * 서울디자인페스티벌 2026 부스배치도가 공식 사이트에 올라왔는지 본다(읽기 전용, 공개 페이지만, 로그인 없음).
 *
 *   node scripts/sdf-floorplan-watch.mjs [--year 2026] [--since 2026-11-01]
 *
 * 보는 곳(같은 호스트에 0.5초 간격):
 *   1. WP REST 글: /wp-json/wp/v2/posts?search=배치도|부스배치|booth plan (소식, 공지가 모두 글이다)
 *   2. WP REST 첨부: /wp-json/wp/v2/media?search=배치도|booth|plan&after=<since>
 *   3. 소식, 공지 목록 HTML(/news/, /notice/)에서 제목에 연도와 "배치도"가 같이 있는 링크
 * 2025는 개막 5일 전(11-07) 소식 글 "[SDF2025] 서울디자인페스티벌 부스배치도"로 올라왔다.
 * 찾으면 주소를 찍고 종료 코드 0, 없으면 "아직 없음"과 종료 코드 2(반복 감시에서 가르기 쉽게).
 */
const BASE = "https://seoul.designfestival.co.kr";
const UA = "Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/130 Safari/537.36";
const args = process.argv.slice(2);
const opt = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
const YEAR = opt("--year", "2026");
const SINCE = opt("--since", `${YEAR}-11-01`);

let last = 0;
async function get(url) {
  const wait = last + 500 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  last = Date.now();
  const res = await fetch(url, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res;
}
const decode = (s) => s.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&amp;/g, "&").replace(/<[^>]+>/g, "");
const isPlan = (s) => /배치도|부스\s*배치|booth[\s_-]*plan|floor[\s_-]*plan/i.test(s);
const isYear = (s) => s.includes(YEAR) || s.includes(`SDF${YEAR.slice(2)}`);
// 사이트를 옮기며 옛 배치도(2022, 2024, 2025)를 2026-09-17에 다시 올렸다. 다른 연도가 적힌 첨부는 뺀다.
const otherYear = (s) => [...s.matchAll(/20\d\d/g)].some((m) => m[0] !== YEAR);

const found = new Map();
const errors = [];

for (const q of ["배치도", "부스배치", "booth plan"]) {
  try {
    const rows = await (await get(`${BASE}/wp-json/wp/v2/posts?search=${encodeURIComponent(q)}&per_page=20&_fields=date,link,title`)).json();
    for (const r of rows) {
      const title = decode(r.title?.rendered ?? "");
      if (isPlan(title) && (isYear(title) || r.date >= SINCE)) found.set(r.link, `글 ${r.date.slice(0, 10)} ${title}`);
    }
  } catch (e) {
    errors.push(String(e.message ?? e));
  }
}

for (const q of ["배치도", "booth", "plan"]) {
  try {
    const rows = await (
      await get(`${BASE}/wp-json/wp/v2/media?search=${encodeURIComponent(q)}&after=${SINCE}T00:00:00&per_page=50&_fields=date,source_url,title`)
    ).json();
    for (const r of rows) {
      const name = `${decode(r.title?.rendered ?? "")} ${r.source_url}`;
      if (otherYear(decode(r.title?.rendered ?? ""))) continue;
      if (isPlan(name) || /booth|plan|배치/i.test(r.source_url)) found.set(r.source_url, `첨부 ${r.date.slice(0, 10)} ${decode(r.title?.rendered ?? "")}`);
    }
  } catch (e) {
    errors.push(String(e.message ?? e));
  }
}

for (const path of ["/news/", "/notice/"]) {
  try {
    const html = await (await get(`${BASE}${path}`)).text();
    for (const m of html.matchAll(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)) {
      const text = decode(m[2]).replace(/\s+/g, " ").trim();
      if (isPlan(text) && isYear(text)) found.set(m[1], `${path} ${text}`);
    }
  } catch (e) {
    errors.push(String(e.message ?? e));
  }
}

for (const e of errors) console.error(`  읽기 실패(건너뜀): ${e}`);
if (found.size) {
  console.log(`찾았어요(${YEAR}, ${SINCE} 이후):`);
  for (const [url, what] of found) console.log(`  ${what}\n    ${url}`);
  process.exit(0);
}
console.log(`아직 없음 (${new Date().toISOString().slice(0, 16)}Z 확인, ${YEAR}, ${SINCE} 이후)`);
process.exit(2);
