// 서울디자인위크 "공간안내" 페이지 → Roam 도면(Floorplan) JSON.
//
//   node scripts/floorplan-from-sdw.mjs <year> <slug>
//
// DDP디자인페어 공식 사이트(seoul-designweek.or.kr/designfair<year>/floorplan/)는 도면
// 이미지 위에 부스 버튼을 % 좌표로 얹는다(top·left·width·height·rotate). 그 좌표를
// 원본 이미지 픽셀로 환산한다 — 손으로 따지 않는다.
// 회전(DDP 아트홀은 곡선이라 부스가 최대 17°까지 기운다)도 그대로 옮긴다 — 펴면
// 비스듬한 줄이 계단처럼 끊기고 이웃끼리 겹쳤다(2026-10-05 비교).
// 원본 그림은 public/booths/<slug>/floorplan.webp로 떠서 지도 바닥(backdrop)에 깐다.
// 버튼 하나 = 부스 하나, code는 사이트의 브랜드 번호(data-no)에 "DF"를 붙인 것 —
// 공식 부스 번호가 없어서 지어내지 않고 출처 번호를 쓴다.
// 결과: src/lib/floorplan-<slug>.json
import { mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const [year, slug] = process.argv.slice(2);
if (!year || !slug) {
  console.error("사용법: node scripts/floorplan-from-sdw.mjs <year> <slug>");
  process.exit(1);
}
const BASE = "https://www.seoul-designweek.or.kr";
const html = await (await fetch(`${BASE}/designfair${year}/floorplan/?viewYear=${year}`)).text();
// 데스크톱 도면만 — 같은 버튼이 모바일 구역별 도면에 한 번 더 나온다.
const desk = html.slice(html.indexOf('id="deskWrap"'));
const desktop = desk.slice(0, desk.indexOf("only-mobile") > 0 ? desk.indexOf("only-mobile") : undefined);
const img = desktop.match(/class="floorplan" src="([^"?]+)/)[1];
const buf = Buffer.from(await (await fetch(BASE + img)).arrayBuffer());
// PNG IHDR: 너비·높이는 16바이트부터.
const W = buf.readUInt32BE(16), H = buf.readUInt32BE(20);

const re = /data-no="(\d+)"\s*style="top:([\d.]+)%;left:([\d.]+)%;width:([\d.]+)%;height:([\d.]+)%;transform:rotate\(([-\d.]+)deg\)"\s*aria-label="([^"]+)"/g;
const seen = new Set();
const booths = [];
for (const m of desktop.matchAll(re)) {
  const [, no, top, left, w, h, deg, name] = m;
  if (seen.has(no)) continue;
  seen.add(no);
  const bw = (+w / 100) * W, bh = (+h / 100) * H;
  const cafe = /^cafe\b/i.test(name);
  booths.push({
    code: `DF${no}`,
    x: Math.round((+left / 100) * W + bw / 2),
    y: Math.round((+top / 100) * H + bh / 2),
    w: Math.round(bw),
    h: Math.round(bh),
    color: cafe ? "#aeb4bf" : "#dcdee3",
    name: name.trim(),
    kind: cafe ? "facility" : "exhibitor",
    ...(+deg ? { rotate: +deg } : {}),
  });
}
// 입구·출구·화장실은 버튼이 아니라 배경 그림에만 있다 — 그림의 표시 위치(%)를 옮겨 적는다.
// 연도마다 도면이 바뀌면 여기만 고친다.
const MARKS = {
  2026: { entrance: [75.8, 79.1], exit: [14.7, 48.5], wc: [[10.75, 50.8], [85.8, 67.5]] },
};
const mk = MARKS[year];
const pt = ([px, py]) => ({ x: Math.round((px / 100) * W), y: Math.round((py / 100) * H) });
mkdirSync(`public/booths/${slug}`, { recursive: true });
await sharp(buf).webp({ quality: 80 }).toFile(`public/booths/${slug}/floorplan.webp`);
const out = {
  width: W,
  height: H,
  backdrop: { src: `/booths/${slug}/floorplan.webp`, opacity: 0.55 },
  halls: [{ name: "DDP 아트홀", x: 0, y: 0, w: W, h: H }],
  decor: mk ? mk.wc.map((p) => ({ type: "wc", ...pt(p) })) : [],
  ...(mk && {
    entrance: pt(mk.entrance),
    exit: pt(mk.exit),
    gates: [
      { id: "in", label: "아트홀 입구", kind: "in", ...pt(mk.entrance) },
      { id: "out", label: "아트홀 출구", kind: "out", ...pt(mk.exit) },
    ],
  }),
  booths,
  source: `${BASE}/designfair${year}/floorplan/ (${new Date().toISOString().slice(0, 10)}) · 배경 ${img}`,
};
const file = `src/lib/floorplan-${slug}.json`;
writeFileSync(file, JSON.stringify(out, null, 1));
console.log(`${file}: 부스 ${booths.length} · ${W}×${H}`);
