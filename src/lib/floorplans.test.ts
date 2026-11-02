import { describe, expect, it } from "vitest";
import { FLOORPLANS } from "./floorplans";
import { findBoothOverlaps } from "./floorplan/overlap";
import { aisleRoute } from "./aisle-route";
import { booths } from "./mock/seed";
import sibf from "./floorplan-sibf.json";
import sifJson from "./floorplan-sif.json";
import { sifBooths } from "./mock/seed-sif";
import haJson from "./floorplan-house-archive.json";

// displayZone 부스(책마을 B4xx 등)는 좌표 미트레이스 — 지도엔 존으로만 표시,
// 개별 rect가 의도적으로 없다. rect 존재 검사에서 제외한다.
const zoneOnly = new Set(
  sibf.booths
    .filter((b) => (b as { displayZone?: string }).displayZone)
    .map((b) => b.code),
);

describe("SIBF floorplan", () => {
  const fp = FLOORPLANS["sibf-2026"];

  it("never overlaps two booth rectangles", () => {
    const r = fp.booths.map((b) => ({
      code: b.code,
      l: b.x - b.w / 2,
      rt: b.x + b.w / 2,
      t: b.y - b.h / 2,
      bt: b.y + b.h / 2,
    }));
    for (let i = 0; i < r.length; i++) {
      for (let j = i + 1; j < r.length; j++) {
        const a = r[i];
        const b = r[j];
        // touching edges (≤2px) are fine; only a real overlap fails.
        const ox = Math.min(a.rt, b.rt) - Math.max(a.l, b.l);
        const oy = Math.min(a.bt, b.bt) - Math.max(a.t, b.t);
        expect(ox > 2 && oy > 2, `${a.code} overlaps ${b.code}`).toBe(false);
      }
    }
  });

  it("has a rect for every traced SIBF booth (no fallback)", () => {
    const codes = new Set(fp.booths.map((b) => b.code));
    for (const b of booths) {
      if (zoneOnly.has(b.code!)) continue; // 존 표시 부스는 rect 없음(정상)
      expect(codes.has(b.code!), `missing floorplan rect for ${b.code}`).toBe(
        true,
      );
    }
    expect(fp.booths.length).toBe(booths.length - zoneOnly.size);
  });

  it("keeps every booth inside the canvas", () => {
    for (const b of fp.booths) {
      expect(b.x - b.w / 2).toBeGreaterThanOrEqual(0);
      expect(b.x + b.w / 2).toBeLessThanOrEqual(fp.width);
      expect(b.y - b.h / 2).toBeGreaterThanOrEqual(0);
      expect(b.y + b.h / 2).toBeLessThanOrEqual(fp.height);
    }
  });

  it("defines a walkable interior covering every booth", () => {
    const interior = fp.interior ?? [];
    expect(interior.length).toBeGreaterThan(0);
    const inside = (x: number, y: number) =>
      interior.some(
        (r) =>
          x >= r.x - r.w / 2 &&
          x <= r.x + r.w / 2 &&
          y >= r.y - r.h / 2 &&
          y <= r.y + r.h / 2,
      );
    // Every booth centre must sit inside the walkable region (so it's routable).
    for (const b of fp.booths)
      expect(inside(b.x, b.y), `booth ${b.code} outside interior`).toBe(true);
    // Gates too.
    for (const g of fp.gates ?? [])
      expect(inside(g.x, g.y), `gate ${g.id} outside interior`).toBe(true);
  });

  it("routes a cross-hall path that never leaves the building", () => {
    const interior = fp.interior ?? [];
    const inside = (x: number, y: number) =>
      interior.some(
        (r) =>
          x >= r.x - r.w / 2 - 1 &&
          x <= r.x + r.w / 2 + 1 &&
          y >= r.y - r.h / 2 - 1 &&
          y <= r.y + r.h / 2 + 1,
      );
    // Pick booths from both halls so the route must use the passage.
    const a = fp.booths.find((b) => b.code.startsWith("A1"))!;
    const b = fp.booths.find((x) => x.code.startsWith("B"))!;
    const stops = [
      fp.entrance!,
      { x: a.x, y: a.y },
      { x: b.x, y: b.y },
      fp.exit!,
    ];
    const pts = aisleRoute(
      stops,
      fp.booths.map((bb) => ({ x: bb.x, y: bb.y, w: bb.w, h: bb.h })),
      fp.width,
      fp.height,
      fp.interior,
    );
    expect(pts.length).toBeGreaterThan(2);
    // Sample along every segment — no point may fall outside the building.
    for (let i = 1; i < pts.length; i++) {
      const p0 = pts[i - 1];
      const p1 = pts[i];
      const steps = 12;
      for (let s = 0; s <= steps; s++) {
        const x = p0.x + ((p1.x - p0.x) * s) / steps;
        const y = p0.y + ((p1.y - p0.y) * s) / steps;
        expect(
          inside(x, y),
          `route point (${Math.round(x)},${Math.round(y)}) left the building`,
        ).toBe(true);
      }
    }
  });
});

describe("SIF floorplan", () => {
  const fp = FLOORPLANS["sif-2026"];

  // 아래 두 값은 의도적인 트립와이어다. 이 JSON은 외부 소스(파일명이
  // content-hash라 매번 바뀌는 번들)에서 재추출되므로, 재추출로 개수나
  // 캔버스 크기가 바뀌면 이 테스트가 실패해 "의식적으로" 갱신하게 만든다 —
  // 조용히 통과시키지 않는다.
  it("pins the extracted floorplan's size", () => {
    expect(fp.booths.length).toBe(914);
    expect([fp.width, fp.height]).toEqual([3028, 1637]);
  });

  it("converts JSON top-left coords to centre coords", () => {
    const byCode = new Map(sifJson.booths.map((b) => [b.code, b]));
    for (const b of fp.booths) {
      const src = byCode.get(b.code);
      expect(src, `${b.code} missing from JSON`).toBeDefined();
      expect(b.x, `${b.code} x`).toBe(src!.x + src!.w / 2);
      expect(b.y, `${b.code} y`).toBe(src!.y + src!.h / 2);
      expect(b.w, `${b.code} w`).toBe(src!.w);
      expect(b.h, `${b.code} h`).toBe(src!.h);
    }
  });

  it("keeps every booth inside the canvas", () => {
    for (const b of fp.booths) {
      expect(b.x - b.w / 2, `${b.code} left`).toBeGreaterThanOrEqual(0);
      expect(b.x + b.w / 2, `${b.code} right`).toBeLessThanOrEqual(fp.width);
      expect(b.y - b.h / 2, `${b.code} top`).toBeGreaterThanOrEqual(0);
      expect(b.y + b.h / 2, `${b.code} bottom`).toBeLessThanOrEqual(fp.height);
    }
  });

  it("never overlaps two booth rectangles", () => {
    // 914개 → 417k 쌍. 쌍마다 expect()를 부르면 느리므로 실패만 모아 한 번 단언한다.
    const r = fp.booths.map((b) => ({
      code: b.code,
      l: b.x - b.w / 2,
      rt: b.x + b.w / 2,
      t: b.y - b.h / 2,
      bt: b.y + b.h / 2,
    }));
    const bad: string[] = [];
    for (let i = 0; i < r.length; i++) {
      for (let j = i + 1; j < r.length; j++) {
        const a = r[i];
        const b = r[j];
        // 변이 맞닿는 건(≤2px) 정상. 진짜 겹칠 때만 실패.
        const ox = Math.min(a.rt, b.rt) - Math.max(a.l, b.l);
        const oy = Math.min(a.bt, b.bt) - Math.max(a.t, b.t);
        if (ox > 2 && oy > 2) bad.push(`${a.code}×${b.code}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("has a rect for every seeded SIF booth", () => {
    const codes = new Set(fp.booths.map((b) => b.code));
    for (const b of sifBooths)
      expect(codes.has(b.code!), `missing rect for ${b.code}`).toBe(true);
    expect(fp.booths.length).toBe(sifBooths.length);
  });
});

describe("HOUSE ARCHIVE floorplan", () => {
  const fp = FLOORPLANS["house-archive-2026"];

  // 재추출로 데이터가 잘려도 조용히 통과하지 않게 절대값을 박는다.
  // 캔버스도 리터럴로 박아야 한다 — haJson.width와 비교하면 buildHouseArchive가
  // 그 값을 그대로 넘기므로 양쪽이 같은 출처가 되어 트립와이어가 안 걸린다.
  it("pins the extracted floorplan's size", () => {
    expect(fp.booths.length).toBe(104);
    expect(haJson.unitsPerMeter).toBe(32);
    expect([fp.width, fp.height]).toEqual([2614, 1128]);
  });

  it("converts JSON top-left coords to centre coords", () => {
    const byCode = new Map(haJson.booths.map((b) => [b.code, b]));
    for (const b of fp.booths) {
      const src = byCode.get(b.code);
      expect(src, `${b.code} missing from JSON`).toBeDefined();
      expect(b.x, `${b.code} x`).toBe(src!.x + src!.w / 2);
      expect(b.y, `${b.code} y`).toBe(src!.y + src!.h / 2);
    }
  });

  it("keeps every booth inside the canvas", () => {
    for (const b of fp.booths) {
      expect(b.x - b.w / 2, `${b.code} left`).toBeGreaterThanOrEqual(0);
      expect(b.x + b.w / 2, `${b.code} right`).toBeLessThanOrEqual(fp.width);
      expect(b.y - b.h / 2, `${b.code} top`).toBeGreaterThanOrEqual(0);
      expect(b.y + b.h / 2, `${b.code} bottom`).toBeLessThanOrEqual(fp.height);
    }
  });

  it("never overlaps two booth rectangles", () => {
    const r = fp.booths.map((b) => ({
      code: b.code,
      l: b.x - b.w / 2, rt: b.x + b.w / 2,
      t: b.y - b.h / 2, bt: b.y + b.h / 2,
    }));
    const bad: string[] = [];
    for (let i = 0; i < r.length; i++)
      for (let j = i + 1; j < r.length; j++) {
        const a = r[i], b = r[j];
        const ox = Math.min(a.rt, b.rt) - Math.max(a.l, b.l);
        const oy = Math.min(a.bt, b.bt) - Math.max(a.t, b.t);
        if (ox > 2 && oy > 2) bad.push(`${a.code}×${b.code}`);
      }
    expect(bad).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 등록된 **모든** 도면에 거는 불변식.
//
// 예전엔 이 검사가 전시 이름이 박힌 describe 안에만 있었다. 그래서 SIBF·SIF는
// 깨끗한데 DDP가 23쌍, 카페쇼가 1쌍 겹친 채로 나갔다 — 전시를 추가하는 건 데이터
// 한 줄인데 검사는 전시마다 손으로 써야 해서, 새 전시가 아무 검사도 안 받고 들어왔다.
// 틀에서 찍어내는 구조면 검사도 틀에 걸어야 한다.
// ---------------------------------------------------------------------------
describe("회전을 보는 겹침 판정", () => {
  const box = (code: string, x: number, y: number, rotate = 0) => ({
    code,
    x,
    y,
    w: 100,
    h: 20,
    rotate,
  });

  it("축정렬 상자로는 겹쳐 보이는 비스듬한 이웃을 안 겹쳤다고 본다", () => {
    // 둘 다 45°로 기운 100×20 부스. B는 A의 **짧은 축 방향으로 40** 떨어져 있어
    // 실제로는 안 겹친다(20 폭 두 개가 40 간격). 그런데 기운 상자의 축정렬 bbox는
    // 한 변이 85라 둘이 크게 겹쳐 보인다 — 축정렬로만 재면 거짓 양성이다.
    // DDP 아트홀(부스가 최대 17° 기움)에서 이 오판으로 60개가 잡혔다.
    const d = 40 / Math.SQRT2;
    expect(findBoothOverlaps([box("A", 0, 0, 45), box("B", -d, d, 45)])).toEqual([]);
  });

  it("정말 겹친 쌍은 깊이와 함께 잡는다", () => {
    const ov = findBoothOverlaps([box("A", 0, 0), box("B", 0, 10)]);
    expect(ov).toHaveLength(1);
    expect(ov[0].depth).toBeCloseTo(10, 1);
  });

  it("맞붙은 것은 겹친 게 아니다", () => {
    expect(findBoothOverlaps([box("A", 0, 0), box("B", 0, 20)])).toEqual([]);
  });
});

/**
 * 겹침이 **주최 원본의 사실**인 쌍 — 우리가 옮기다 만든 오차가 아니라서 고치지 않는다.
 *
 * 카페쇼 도면은 손으로 딴 게 아니라 exporum 배치도 API에서 그대로 변환한 것이다.
 * 그러니 1m 겹침은 주최가 그렇게 들고 있는 값이고, 우리가 부스를 줄이면 지도가
 * 원본과 달라지기만 한다(`floorplan-cafeshow.test.ts`가 이 쌍을 따로 못박아 둔다).
 * 여기 적지 않은 겹침은 전부 오차로 본다 — 예외는 이름을 대야 한다.
 */
const KNOWN_OVERLAPS: Record<string, string[]> = {
  "cafeshow-2026": ["A107×A111"],
};

describe.each(Object.keys(FLOORPLANS))("%s 도면", (slug) => {
  const fp = FLOORPLANS[slug];

  it("부스가 서로 겹치지 않는다", () => {
    // 손으로 딴 도면에는 겹치는 부스가 없다 — 한 칸을 두 곳에 팔 수는 없으니까.
    // 그러니 겹침이 보이면 전시의 사실이 아니라 우리가 옮기다 만든 오차다.
    // 도면을 다시 생성해 겹침이 되살아나면 이 검사가 알린다
    // (`scripts/deoverlap-floorplan.ts`를 다시 돌려야 한다).
    const pairs = findBoothOverlaps(fp.booths)
      .map((o) => [o.a, o.b].sort().join("×"))
      .filter((p) => !(KNOWN_OVERLAPS[slug] ?? []).includes(p))
      .sort();
    expect(pairs, `${slug}: 설명 안 되는 겹침 ${pairs.length}쌍`).toEqual([]);
  });

  it("부스 코드가 중복되지 않는다", () => {
    const seen = new Set<string>();
    const dup = fp.booths.filter((b) => (seen.has(b.code) ? true : (seen.add(b.code), false)));
    expect(dup.map((b) => b.code)).toEqual([]);
  });
});
