// exporum 배치도 API → Roam 도면(Floorplan) JSON.
//
//   node scripts/floorplan-from-exporum.mjs <exporumExhibitionId> <slug>
//
// 서울카페쇼 등 여러 박람회가 floorplan.exporum.com을 쓴다. 인증 없이 층(floors)·
// 구역(zones)·부스(booths)를 좌표째 내준다 — 도면을 손으로 따거나 PDF 선을 읽을
// 필요가 없다(2026-10-01 E2E에서 "도면 추출을 전시마다 새로 짠다"가 사람 손 1번이었다).
//
// 층이 여럿이면 한 지도에 **세로로 쌓는다**(휴대폰 세로 화면). 층 사이에 이름표를 둔다.
// API는 1m = 10단위다(표준부스 3m = 30). 다른 도면과 맞춰 1m = 20단위로 키운다.
// 출입구는 API에 없다 — 지어 넣지 않는다(합성기·지도가 없으면 없는 대로 그린다).
//
// 결과: src/lib/floorplan-<slug>.json
import { writeFileSync } from "node:fs";

const [id, slug] = process.argv.slice(2);
if (!id || !slug) {
  console.error("사용법: node scripts/floorplan-from-exporum.mjs <exporumExhibitionId> <slug>");
  process.exit(1);
}
const API = "https://floorplan.exporum.com/api";
const get = async (p) => {
  const r = await fetch(`${API}/${p}`, { headers: { "user-agent": "Mozilla/5.0" } });
  if (!r.ok) throw new Error(`${p} → HTTP ${r.status}`);
  return r.json();
};
const [floors, zones, booths] = await Promise.all([
  get(`floors?exhibitionId=${id}`),
  get(`zones?exhibitionId=${id}`),
  get(`booths?exhibitionId=${id}`),
]);

const K = 2; // 10단위/m → 20단위/m
const GAP = 240; // 층 사이(이름표 자리)
const FACILITY = "#aeb4bf";
const GENERAL = "#dcdee3";

let offsetY = GAP;
const out = { width: 0, height: 0, halls: [], decor: [], booths: [] };
for (const f of [...floors].sort((a, b) => a.order - b.order)) {
  const fb = booths.filter((b) => b.floorId === f.id);
  const fz = zones.filter((z) => z.floorId === f.id && z.type === "hall");
  if (fb.length === 0) continue;
  // 이 층의 내용(홀 + 부스) 경계 — 층 원점이 아니라 실제 내용 기준으로 붙인다.
  const xs = [...fz.map((z) => z.x), ...fb.map((b) => b.x)];
  const ys = [...fz.map((z) => z.y), ...fb.map((b) => b.y)];
  const minX = Math.min(...xs), minY = Math.min(...ys);
  const maxX = Math.max(...fz.map((z) => z.x + z.width), ...fb.map((b) => b.x + b.width));
  const maxY = Math.max(...fz.map((z) => z.y + z.height), ...fb.map((b) => b.y + b.height));
  const tx = (x) => (x - minX) * K + 80;
  const ty = (y) => (y - minY) * K + offsetY;

  out.decor.push({ type: "header", x: 80, y: offsetY - 170, w: 420, h: 110, text: f.name.replace(/^(\d+)F$/, "$1층") });
  for (const z of fz) {
    // FloorplanHall은 좌상단 기준(x, y, w, h).
    out.halls.push({ name: z.name, x: tx(z.x), y: ty(z.y), w: z.width * K, h: z.height * K });
  }
  for (const b of fb) {
    const w = b.width * K, h = b.height * K;
    out.booths.push({
      code: b.boothNo,
      // FloorplanBooth는 중심 기준.
      x: tx(b.x) + w / 2,
      y: ty(b.y) + h / 2,
      w,
      h,
      color: b.category === "exhibitor" ? GENERAL : FACILITY,
      name: b.name ?? undefined,
      kind: b.category === "exhibitor" ? "exhibitor" : "facility",
    });
  }
  out.width = Math.max(out.width, (maxX - minX) * K + 160);
  offsetY += (maxY - minY) * K + GAP + 120;
}
out.height = offsetY;
out.source = `floorplan.exporum.com exhibitionId=${id} (${new Date().toISOString().slice(0, 10)})`;
const file = `src/lib/floorplan-${slug}.json`;
writeFileSync(file, JSON.stringify(out, null, 1));
console.log(`${file}: 층 ${floors.length} · 홀 ${out.halls.length} · 부스 ${out.booths.length} · ${out.width}×${out.height}`);
