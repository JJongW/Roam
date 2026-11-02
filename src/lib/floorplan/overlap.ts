import type { FloorplanBooth } from "@/lib/floorplans";

/**
 * 부스끼리 겹치는 쌍을 센다.
 *
 * **왜 이게 코드에 있나**: 주최 도면에는 겹치는 부스가 없다. 부스는 팔린 칸이고,
 * 한 칸을 두 곳에 팔 수는 없다. 그러니 우리 지도에 겹침이 보이면 그건 전시의
 * 사실이 아니라 **우리가 옮기는 과정에서 만든 오차**다 — 눈으로 찾을 게 아니라
 * 숫자로 세서 0 으로 떨어뜨려야 한다.
 *
 * 축정렬 사각형이 아니라 **회전을 포함한** 분리축 판정(SAT)을 쓴다. DDP 아트홀처럼
 * 곡선 벽을 따라 부스가 비스듬히 선 도면은, 축정렬 상자로 재면 안 겹치는 이웃이
 * 겹친 것으로 잡혀 60 개가 전부 거짓 양성이 된다.
 */
export interface BoothOverlap {
  a: string;
  b: string;
  /** 겹친 깊이(도면 단위). 빼내려면 최소 이만큼 줄이거나 떼야 한다. */
  depth: number;
  /** 그 깊이를 재는 방향(단위벡터). 이 축으로만 줄이면 최소한으로 고쳐진다 —
   *  등비로 줄이면 세로로 20 겹친 500 짜리 부스가 가로로도 90 깎인다. */
  axis: [number, number];
}

type Poly = [number, number][];

export function boothCorners(b: FloorplanBooth): Poly {
  const a = ((b.rotate ?? 0) * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const hw = b.w / 2;
  const hh = b.h / 2;
  return (
    [
      [-hw, -hh],
      [hw, -hh],
      [hw, hh],
      [-hw, hh],
    ] as const
  ).map(([dx, dy]) => [b.x + dx * c - dy * s, b.y + dx * s + dy * c] as [number, number]);
}

/** 두 상자가 겹친 깊이와 그 방향. 깊이 0 이면 안 겹친다(맞붙은 것은 겹친 게 아니다). */
export function penetration(p: Poly, q: Poly, eps = 0.01): { depth: number; axis: [number, number] } {
  let min = Infinity;
  let minAxis: [number, number] = [1, 0];
  for (const poly of [p, q]) {
    for (let i = 0; i < poly.length; i++) {
      const [x1, y1] = poly[i];
      const [x2, y2] = poly[(i + 1) % poly.length];
      const len = Math.hypot(x2 - x1, y2 - y1);
      if (!len) continue;
      const ax = -(y2 - y1) / len;
      const ay = (x2 - x1) / len;
      const proj = (r: Poly) => r.map(([x, y]) => x * ax + y * ay);
      const pp = proj(p);
      const qq = proj(q);
      const d = Math.min(Math.max(...pp), Math.max(...qq)) - Math.max(Math.min(...pp), Math.min(...qq));
      if (d <= eps) return { depth: 0, axis: [ax, ay] };
      if (d < min) {
        min = d;
        minAxis = [ax, ay];
      }
    }
  }
  return { depth: min === Infinity ? 0 : min, axis: minAxis };
}

export function findBoothOverlaps(booths: FloorplanBooth[], eps = 0.01): BoothOverlap[] {
  const polys = booths.map(boothCorners);
  // 넓은 단계: 축정렬 bbox 가 안 겹치면 SAT 을 돌리지 않는다. sif 914 부스에서
  // 전수 비교는 41 만 쌍이라 테스트가 느려진다.
  const box = polys.map((p) => ({
    x1: Math.min(...p.map((c) => c[0])),
    y1: Math.min(...p.map((c) => c[1])),
    x2: Math.max(...p.map((c) => c[0])),
    y2: Math.max(...p.map((c) => c[1])),
  }));
  const out: BoothOverlap[] = [];
  for (let i = 0; i < booths.length; i++) {
    for (let j = i + 1; j < booths.length; j++) {
      const A = box[i];
      const B = box[j];
      if (Math.min(A.x2, B.x2) - Math.max(A.x1, B.x1) <= eps) continue;
      if (Math.min(A.y2, B.y2) - Math.max(A.y1, B.y1) <= eps) continue;
      const { depth, axis } = penetration(polys[i], polys[j], eps);
      if (depth > eps) out.push({ a: booths[i].code, b: booths[j].code, depth, axis });
    }
  }
  return out;
}
