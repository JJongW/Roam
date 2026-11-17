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

// 참가 부스로 보는 분류. 2026-11 API에 `sponsor`가 새로 생겼다 — 후원사 이름이 붙었을 뿐
// 번호가 있는 참가 부스라(예: A361 스위트컵, D301 퍼플랜드) 시설로 빠지면 지도와 목록에서 사라진다.
// `organizer`(무대 등)만 시설로 남긴다.
const EXHIBITOR_CATEGORIES = new Set(["exhibitor", "sponsor"]);

// API가 감싸는 네모로만 주는 ㄱ자 부스를 공식 배치도 그림대로 자른다(API 단위, 1m = 10).
// 감싸는 네모 그대로면 이웃 부스와 겹친다(한 칸을 두 곳에 팔 수는 없다).
// `from`이 지금 API 값과 다르면 주최가 배치를 바꾼 것이니 자르지 않고 경고만 한다 — 다시 확인할 것.
// 출처: exporum 서울카페쇼 2026 1층 배치도 그림(2026-11-17 확인).
const RECT_OVERRIDES = {
  19: {
    // ㄱ자 왼쪽 아래 다리가 A843 위 끝에서 끝난다 → 아래 1m를 잘라 A843, A841과 안 겹치게.
    A919: { from: [59, 1301, 154, 120], to: [59, 1301, 154, 110] },
    // ㄱ자 오른쪽 아래 다리가 A271 위 끝에서 끝난다 → 아래 1m를 잘라 A271과 안 겹치게.
    A119: { from: [1390, 1301.1, 90, 120], to: [1390, 1301.1, 90, 110] },
    // A842(3×3m)를 왼쪽 아래에서 감싸는 ㄱ자. 이름이 적힌 오른쪽 3m 폭만 남긴다.
    A841: { from: [190, 1411, 60, 60], to: [220, 1411, 30, 60] },
  },
};
const overrides = RECT_OVERRIDES[id] ?? {};
for (const b of booths) {
  const o = overrides[b.boothNo];
  if (!o) continue;
  const now = [b.x, b.y, b.width, b.height];
  if (now.some((v, i) => Math.abs(v - o.from[i]) > 0.05)) {
    console.warn(`경고: ${b.boothNo} API 값이 바뀌어 자르지 않음 (지금 ${now.join(",")}, 예상 ${o.from.join(",")})`);
    continue;
  }
  [b.x, b.y, b.width, b.height] = o.to;
}

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
    const isExhibitor = EXHIBITOR_CATEGORIES.has(b.category);
    out.booths.push({
      code: b.boothNo,
      // FloorplanBooth는 중심 기준. 왼쪽 위 모서리는 1단위(5cm)로 맞춘다 — API 좌표의
      // 0.1 흔들림(1150.1 옆 1210)이 이웃과 1~2cm 겹침을 만들기 때문이다.
      x: Math.round(tx(b.x)) + w / 2,
      y: Math.round(ty(b.y)) + h / 2,
      w,
      h,
      color: isExhibitor ? GENERAL : FACILITY,
      name: b.name ?? undefined,
      kind: isExhibitor ? "exhibitor" : "facility",
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
