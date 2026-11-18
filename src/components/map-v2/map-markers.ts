import type { Floorplan } from "@/lib/floorplans";
import { V2_NUM, V2_PX } from "@/styles/v2/lengths.generated";

/**
 * 지도 위 길잡이 표식(출입구 알약, 화장실)의 자리와 크기. 순수 함수라 겹침을 테스트로 잰다.
 *
 * - 크기: 보통 부스 칸 높이에 맞춘 글자(`ratio-map-entrance-label`)와, 맞춘 배율(fitScale)에서
 *   가장 작은 글자 역할(t2, 12px)이 되는 크기 가운데 큰 쪽. 예전엔 칸 비율만 써서 390 전체 보기에서
 *   출입구 글자가 4px 아래로 내려가 읽히지 않았다(W3 검토). iOS도 "입구는 보통 부스 이름보다 작아지지
 *   않는다"(MapView entranceSprite).
 * - 자리: 표식 점은 홀 벽 위에 있다. 알약과 화장실 표식을 그 벽 **바깥쪽**으로 붙여 그려 부스 칸을
 *   덮지 않는다(Figma 겹침 금지, 11-11). 어느 벽인지는 점에서 가장 가까운 홀 테두리로 정한다.
 * - 출입구가 `decor`에 없고 `gates`에만 있는 도면(DDP, 서울가구쇼)도 그린다(iOS와 같음). 같은 자리의
 *   입구와 출구는 한 번만.
 */

export interface MarkerRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface EntranceMarker extends MarkerRect {
  text: string;
  fontSize: number;
}

export interface WcMarker extends MarkerRect {
  /** 아이콘 한 변(도면 단위) */
  icon: number;
}

export function typicalCellHeight(booths?: { w: number; h: number }[]): number {
  if (!booths?.length) return 80;
  const hs = booths.map((b) => Math.min(b.w, b.h)).sort((a, b) => a - b);
  return hs[Math.floor(hs.length / 2)];
}

/**
 * 점이 붙은 벽의 바깥 방향(단위 벡터). 가장 가까운 홀을 고른다. 점이 홀 안(벽 위 포함)이면 가장 가까운
 * 테두리 바깥으로, 홀 밖이면 그 홀에서 점 쪽으로. 홀이 없으면 도면 전체를 홀로 본다.
 */
export function outwardOf(
  fp: Floorplan,
  px: number,
  py: number,
): { dx: number; dy: number } {
  const boxes = fp.halls.length
    ? fp.halls
    : [{ x: 0, y: 0, w: fp.width, h: fp.height }];
  let hall = boxes[0];
  let hallD = Infinity;
  for (const h of boxes) {
    const ox = Math.max(h.x - px, 0, px - (h.x + h.w));
    const oy = Math.max(h.y - py, 0, py - (h.y + h.h));
    const d = Math.hypot(ox, oy);
    if (d < hallD) {
      hallD = d;
      hall = h;
    }
  }
  const h = hall;
  const cands = [
    { d: py - h.y, dx: 0, dy: -1 },
    { d: h.y + h.h - py, dx: 0, dy: 1 },
    { d: px - h.x, dx: -1, dy: 0 },
    { d: h.x + h.w - px, dx: 1, dy: 0 },
  ];
  // 홀 밖이면 음수가 된 쪽(넘어간 쪽)이, 안이면 가장 가까운 쪽이 가장 작다.
  const best = cands.reduce((a, b) => (b.d < a.d ? b : a));
  return { dx: best.dx, dy: best.dy };
}

/** 표식 글자 크기(도면 단위). */
export function markerFontSize(
  fp: Floorplan,
  fitScale: number | undefined,
  size = 1,
): number {
  const byCell =
    typicalCellHeight(fp.booths) * V2_NUM["ratio-map-entrance-label"] * size;
  const readable =
    fitScale && fitScale > 0 ? V2_PX["font-size-t2"] / fitScale : 0;
  return Math.max(byCell, readable);
}

function placeOutside(
  fp: Floorplan,
  px: number,
  py: number,
  w: number,
  h: number,
): MarkerRect {
  const { dx, dy } = outwardOf(fp, px, py);
  // 벽 선 두께만큼 띄운다.
  const gap = V2_PX["stroke-width-s3"];
  const cx = px + dx * (w / 2 + gap);
  const cy = py + dy * (h / 2 + gap);
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

export function entranceMarkers(
  fp: Floorplan,
  fitScale: number | undefined,
): EntranceMarker[] {
  const points: { x: number; y: number; text: string; size: number }[] = [];
  for (const d of fp.decor) {
    if (d.type === "entrance")
      points.push({ x: d.x, y: d.y, text: d.text, size: d.size ?? 1 });
  }
  if (points.length === 0) {
    const seen = new Set<string>();
    for (const g of fp.gates ?? []) {
      const k = `${g.x},${g.y}`;
      if (seen.has(k)) continue;
      seen.add(k);
      points.push({ x: g.x, y: g.y, text: g.label, size: 1 });
    }
  }
  const out: EntranceMarker[] = [];
  for (const p of points) {
    const fs = markerFontSize(fp, fitScale, p.size);
    const w = p.text.length * fs * 0.9 + fs * 1.6;
    const h = fs * 1.7;
    // 가까이 붙은 입구와 출구(SIBF B1홀)가 서로 덮지 않게 벽을 따라 비켜 놓는다.
    const r = slideClear(fp, p.x, p.y, placeOutside(fp, p.x, p.y, w, h), out);
    out.push({ ...r, text: p.text, fontSize: fs });
  }
  return out;
}

export function overlaps(a: MarkerRect, b: MarkerRect): boolean {
  return (
    a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
  );
}

/** 화장실 표식. 출입구 알약을 먼저 놓고, 그 자리를 비켜 벽을 따라 놓는다(SIBF A홀 입구 옆 화장실). */
export function wcMarkers(
  fp: Floorplan,
  fitScale: number | undefined,
  taken: MarkerRect[] = entranceMarkers(fp, fitScale),
): WcMarker[] {
  const fs = markerFontSize(fp, fitScale);
  const side = fs * 1.7; // 출입구 알약과 같은 높이
  const placed: MarkerRect[] = [...taken];
  const out: WcMarker[] = [];
  for (const d of fp.decor) {
    if (d.type !== "wc") continue;
    const r = slideClear(
      fp,
      d.x,
      d.y,
      placeOutside(fp, d.x, d.y, side, side),
      placed,
    );
    placed.push(r);
    out.push({ ...r, icon: fs * 1.1 });
  }
  return out;
}

/** 이미 놓인 표식과 겹치면 벽을 따라(바깥 방향과 수직으로) 비켜 놓는다. */
function slideClear(
  fp: Floorplan,
  px: number,
  py: number,
  r: MarkerRect,
  placed: MarkerRect[],
): MarkerRect {
  const { dx } = outwardOf(fp, px, py);
  const gap = V2_PX["stroke-width-s3"];
  const out = { ...r };
  for (let guard = 0; guard <= placed.length; guard++) {
    const hit = placed.find((o) => overlaps(o, out));
    if (!hit) break;
    if (dx !== 0)
      out.y = out.y >= hit.y ? hit.y + hit.h + gap : hit.y - out.h - gap;
    else out.x = out.x >= hit.x ? hit.x + hit.w + gap : hit.x - out.w - gap;
  }
  return out;
}

/** 표식이 덮는 부스 칸 수(회전 칸은 축 정렬 상자로 근사). 테스트와 점검용. */
export function overlapsBooths(fp: Floorplan, r: MarkerRect): number {
  return fp.booths.filter(
    (b) =>
      r.x < b.x + b.w / 2 &&
      r.x + r.w > b.x - b.w / 2 &&
      r.y < b.y + b.h / 2 &&
      r.y + r.h > b.y - b.h / 2,
  ).length;
}
