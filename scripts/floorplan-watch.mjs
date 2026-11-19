#!/usr/bin/env node
/**
 * 박람회 배치도가 공식 사이트에 올라왔는지 본다(읽기 전용, 공개 페이지만, 로그인 없음).
 *
 *   npm run floorplan:watch -- [moongu] [newyear] [sdf]      # 없으면 셋 다
 *
 * - moongu  문구전 2026 겨울. comicw.net 행사장 배치도(`booth_map.php?fare_id=36`)의 그림 칸이
 *           "배치도를 준비하고 있습니다."(mgbm-empty)인지. 확정 부스번호 목록 수도 찍는다.
 *           11-19: 그림 없음, 번호 목록 242. 관람 안내 공지는 "행사 1주 전 공개 예정".
 * - newyear 새해 준비상점 N.27. `newyear-store.com/program/booth-map`이 "페이지 준비 중"인지. 첫 화면 메뉴 "부스배치도"도
 *           11-19엔 "업데이트 예정입니다." 알림이다.
 * - sdf     서울디자인페스티벌 2026. 기존 `scripts/sdf-floorplan-watch.mjs`를 그대로 부른다.
 *
 * 하나라도 찾으면 종료 코드 0, 모두 아직이면 2, 읽기 실패만 있으면 1.
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const UA = "Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/130 Safari/537.36";
const want = process.argv.slice(2).filter((a) => a !== "--");
const targets = want.length ? want : ["moongu", "newyear", "sdf"];

let last = 0;
async function get(url) {
  const wait = last + 1000 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  last = Date.now();
  const res = await fetch(url, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.text();
}

const checks = {
  async moongu() {
    const url = "https://comicw.net/moongu/booth_map.php?fare_id=36";
    const html = await get(url);
    const count = html.match(/id="mgbm-count">\s*(\d+)\s*개/)?.[1] ?? "?";
    const empty = /class="mgbm-empty"/.test(html);
    const imgs = [...html.matchAll(/<img[^>]+src="([^"]+)"/g)].map((m) => m[1]).filter((s) => !/logo|icon|thumb|default/i.test(s));
    return empty && !imgs.length
      ? { found: false, what: `문구전: 그림 아직 없음(확정 부스번호 ${count}개)` }
      : { found: true, what: `문구전: 배치도 칸이 바뀌었어요(번호 ${count}개) ${imgs.join(" ")}`, url };
  },
  async newyear() {
    const url = "https://newyear-store.com/program/booth-map";
    const html = await get(url);
    const ready = /준비\s*중/.test(html);
    const imgs = [...html.matchAll(/<img[^>]+src="([^"]+)"/g)].map((m) => m[1]).filter((s) => !/logo|icon|schedule|ready/i.test(s));
    return ready && !imgs.length
      ? { found: false, what: "새해 준비상점: 부스배치도 페이지 준비 중" }
      : { found: true, what: `새해 준비상점: 부스배치도 페이지가 바뀌었어요 ${imgs.join(" ")}`, url };
  },
  async sdf() {
    const script = join(dirname(fileURLToPath(import.meta.url)), "sdf-floorplan-watch.mjs");
    const r = spawnSync(process.execPath, [script], { encoding: "utf8" });
    const text = `${r.stdout ?? ""}${r.stderr ?? ""}`.trim();
    if (r.status === 0) return { found: true, what: `서울디자인페스티벌: ${text}` };
    if (r.status === 2) return { found: false, what: `서울디자인페스티벌: ${text}` };
    throw new Error(`sdf 감시 실패: ${text}`);
  },
};

let found = false;
let failed = false;
for (const t of targets) {
  if (!checks[t]) {
    console.error(`모르는 대상: ${t} (moongu, newyear, sdf)`);
    failed = true;
    continue;
  }
  try {
    const r = await checks[t]();
    console.log(`${r.found ? "찾았어요" : "아직"}  ${r.what}${r.url ? `\n    ${r.url}` : ""}`);
    found ||= r.found;
  } catch (e) {
    console.error(`읽기 실패(건너뜀) ${t}: ${e.message ?? e}`);
    failed = true;
  }
}
process.exit(found ? 0 : failed ? 1 : 2);
