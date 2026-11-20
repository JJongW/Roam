// UI 9 길 안내 계산. 순수(iOS `RouteGuide.swift`를 옮겼다).
//
// 결정(11-11): 추적 없음, GPS 없음. 지금 자리는 "근처에 보이는 부스 이름"으로 묻고 선은 한 번만 그린다.
// 헷갈리면 다시 묻는다. 여러 곳을 한 번에 잇지 않고 다음 한 곳씩.
// 선은 부스 칸 사이 통로로만 간다(`aisleRoute`). 도착 부스가 있는 홀 바닥 밖은 막는다(벽을 뚫지 않게).
// 기기에서 계산하고 메모리에만 둔다. 길을 못 찾으면 null이고 화면은 자리만 표시한다.
import { aisleRoute, type RoutePt, type RouteRect } from "@/lib/aisle-route";
import type { Floorplan, FloorplanHall } from "@/lib/floorplans";

export interface RouteBooth {
  id: string;
  code?: string;
  name: string;
}

/** 부스 칸(가운데 기준). 배치도에 없으면 undefined. */
export function cellOf(
  fp: Floorplan,
  code: string | undefined,
): RouteRect | undefined {
  if (!code) return undefined;
  const b = fp.booths.find((x) => x.code === code);
  return b ? { x: b.x, y: b.y, w: b.w, h: b.h } : undefined;
}

/** 칸이 들어 있는 배치도 홀(왼쪽 위 기준). */
export function hallOfCell(
  fp: Floorplan,
  c: RouteRect | undefined,
): FloorplanHall | undefined {
  if (!c) return undefined;
  return fp.halls.find(
    (h) => c.x >= h.x && c.x <= h.x + h.w && c.y >= h.y && c.y <= h.y + h.h,
  );
}

function inHall(h: FloorplanHall | undefined, p: RoutePt): boolean {
  return !h || (p.x >= h.x && p.x <= h.x + h.w && p.y >= h.y && p.y <= h.y + h.h);
}

/** 도착 칸에서 가장 가까운 출입구. 같은 홀 안 출입구를 먼저 본다. */
export function nearestEntrance(fp: Floorplan, to: RouteRect): RoutePt | undefined {
  const decor = fp.decor
    .filter((d) => d.type === "entrance")
    .map((d) => ({ x: d.x, y: d.y }));
  const pts: RoutePt[] = decor.length
    ? decor
    : fp.gates?.length
      ? fp.gates.filter((g) => g.kind === "in").map((g) => ({ x: g.x, y: g.y }))
      : fp.entrance
        ? [fp.entrance]
        : [];
  if (!pts.length) return undefined;
  const hall = hallOfCell(fp, to);
  // 출입구 표식은 벽 바깥에 붙어 있을 수 있어 홀 상자를 조금 넓혀 본다.
  const near = hall
    ? pts.filter((p) =>
        inHall({ ...hall, x: hall.x - 120, y: hall.y - 120, w: hall.w + 240, h: hall.h + 240 }, p),
      )
    : [];
  const pool = near.length ? near : pts;
  const d = (p: RoutePt) => (p.x - to.x) ** 2 + (p.y - to.y) ** 2;
  return pool.reduce((a, b) => (d(b) < d(a) ? b : a));
}

/**
 * 출발 칸에서 도착 칸까지 통로를 따라가는 선. `fromCode`가 없으면 도착 칸에서 가장 가까운 출입구에서.
 * 못 그리면 null.
 */
export function routePath(
  fp: Floorplan,
  fromCode: string | undefined,
  toCode: string | undefined,
): RoutePt[] | null {
  const to = cellOf(fp, toCode);
  if (!to) return null;
  const from = cellOf(fp, fromCode);
  const start: RoutePt | undefined = from ?? nearestEntrance(fp, to);
  if (!start) return null;
  const hall = hallOfCell(fp, to);
  // 다른 홀에서 출발하면 홀 하나로 가두지 않는다(건물 안 통로 전체, 없으면 막지 않음).
  const sameHall = !from || hallOfCell(fp, from) === hall;
  const interior =
    hall && sameHall
      ? [{ x: hall.x + hall.w / 2, y: hall.y + hall.h / 2, w: hall.w + 16, h: hall.h + 16 }]
      : fp.interior;
  const obstacles = fp.booths
    .filter((b) => b.code !== toCode && b.code !== fromCode)
    .filter((b) => !hall || !sameHall || inHall(hall, b))
    .map((b) => ({ x: b.x, y: b.y, w: b.w, h: b.h }));
  const pts = aisleRoute([start, { x: to.x, y: to.y }], obstacles, fp.width, fp.height, interior);
  // 선은 부스 앞 통로에서 멈춘다. 칸 안으로 들어간 끝점은 걷는다(칸은 둘레를 둘러 표시한다).
  const inside = (p: RoutePt) =>
    Math.abs(p.x - to.x) < to.w / 2 && Math.abs(p.y - to.y) < to.h / 2;
  let tail: RoutePt | undefined;
  while (pts.length > 2 && inside(pts[pts.length - 1])) tail = pts.pop();
  // 칸으로 들어가던 마지막 꺾임을 칸 테두리에서 끊는다(선이 칸 바로 앞까지 온다).
  const last = pts[pts.length - 1];
  if (tail && last) {
    if (Math.abs(tail.x - last.x) < 1)
      pts.push({ x: last.x, y: last.y > to.y ? to.y + to.h / 2 : to.y - to.h / 2 });
    else if (Math.abs(tail.y - last.y) < 1)
      pts.push({ x: last.x > to.x ? to.x + to.w / 2 : to.x - to.w / 2, y: last.y });
  }
  return pts.length >= 2 ? pts : null;
}

function segDistance(p: RoutePt, a: RoutePt, b: RoutePt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** 9-03 "가는 길에 하트 남긴 'X'도 있어요" — 선 가까이 있는 하트 부스 하나(출발, 도착 제외). */
export function heartedOnTheWay(
  fp: Floorplan,
  path: RoutePt[],
  hearted: RouteBooth[],
  excluding: Set<string>,
): RouteBooth | undefined {
  if (path.length < 2) return undefined;
  const sizes = fp.booths.map((b) => Math.min(b.w, b.h)).filter((n) => n > 0);
  const near = (sizes.length ? Math.min(...sizes) : 40) * 1.2;
  return hearted.find((b) => {
    if (excluding.has(b.id)) return false;
    const c = cellOf(fp, b.code);
    if (!c) return false;
    return path
      .slice(1)
      .some((q, i) => segDistance(c, path[i], q) - Math.max(c.w, c.h) / 2 < near);
  });
}

/** 도착 뒤 다음 한 곳: 같은 홀에서 아직 안 다녀온 하트 부스 중 가장 가까운 곳. 없으면 다른 홀에서. */
export function nextStop(
  fp: Floorplan,
  after: RouteBooth,
  pool: RouteBooth[],
): RouteBooth | undefined {
  const here = cellOf(fp, after.code);
  if (!here) return undefined;
  const hall = hallOfCell(fp, here);
  const placed = pool
    .filter((b) => b.id !== after.id)
    .map((b) => ({ b, c: cellOf(fp, b.code) }))
    .filter((x): x is { b: RouteBooth; c: RouteRect } => !!x.c);
  const same = placed.filter((x) => hallOfCell(fp, x.c) === hall);
  const list = same.length ? same : placed;
  if (!list.length) return undefined;
  const d = (c: RouteRect) => (c.x - here.x) ** 2 + (c.y - here.y) ** 2;
  return list.reduce((a, x) => (d(x.c) < d(a.c) ? x : a)).b;
}

/** 9-01 하트 남긴 곳을 홀별로(배치도 홀 순서, 그 안은 이름 순). 홀을 모르면 맨 뒤 한 묶음. */
export function heartedByHall(
  fp: Floorplan | undefined,
  hearted: RouteBooth[],
): { hall: string | null; booths: RouteBooth[] }[] {
  const byName = (a: RouteBooth, b: RouteBooth) => a.name.localeCompare(b.name, "ko");
  if (!fp) return hearted.length ? [{ hall: null, booths: [...hearted].sort(byName) }] : [];
  const groups = new Map<string | null, RouteBooth[]>();
  for (const b of hearted) {
    const h = hallOfCell(fp, cellOf(fp, b.code))?.name ?? null;
    groups.set(h, [...(groups.get(h) ?? []), b]);
  }
  const order = [...fp.halls.map((h) => h.name), null];
  return order
    .filter((h) => groups.has(h))
    .map((h) => ({ hall: h, booths: groups.get(h)!.sort(byName) }));
}
