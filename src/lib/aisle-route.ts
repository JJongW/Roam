// ---------------------------------------------------------------------------
// Aisle-aware route geometry. The walking line must follow the gaps *between*
// booth blocks — never cut straight through a booth rectangle. We rasterise the
// booths into an occupancy grid, then A* between consecutive stops through the
// free (aisle) cells, and finally string-pull the grid path back to a few clean
// segments. Booth rects come from the traced floorplan.
// ---------------------------------------------------------------------------

export interface RouteRect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface RoutePt {
  x: number;
  y: number;
}

const CELL = 16; // grid resolution (px). Fine enough to keep ~50px aisles open.
// Grow each booth's blocked footprint so the path keeps clear of booth edges
// and runs down the *centre* of the aisle (never tucked behind a booth box).
const MARGIN = 12;

interface Grid {
  cols: number;
  rows: number;
  blocked: Uint8Array;
}

/** Rasterise booth rects into a blocked/free occupancy grid. */
export function buildGrid(
  rects: RouteRect[],
  width: number,
  height: number,
): Grid {
  const cols = Math.ceil(width / CELL);
  const rows = Math.ceil(height / CELL);
  const blocked = new Uint8Array(cols * rows);
  for (const b of rects) {
    const x0 = b.x - b.w / 2 - MARGIN;
    const x1 = b.x + b.w / 2 + MARGIN;
    const y0 = b.y - b.h / 2 - MARGIN;
    const y1 = b.y + b.h / 2 + MARGIN;
    const cx0 = Math.max(0, Math.floor((x0 - CELL / 2) / CELL));
    const cx1 = Math.min(cols - 1, Math.ceil((x1 - CELL / 2) / CELL));
    const cy0 = Math.max(0, Math.floor((y0 - CELL / 2) / CELL));
    const cy1 = Math.min(rows - 1, Math.ceil((y1 - CELL / 2) / CELL));
    for (let cy = cy0; cy <= cy1; cy++) {
      const py = cy * CELL + CELL / 2;
      if (py < y0 || py > y1) continue;
      for (let cx = cx0; cx <= cx1; cx++) {
        const px = cx * CELL + CELL / 2;
        if (px < x0 || px > x1) continue;
        blocked[cy * cols + cx] = 1;
      }
    }
  }
  return { cols, rows, blocked };
}

const toCol = (x: number) => Math.round((x - CELL / 2) / CELL);
const toRow = (y: number) => Math.round((y - CELL / 2) / CELL);
const cellCenter = (c: number, r: number): RoutePt => ({
  x: c * CELL + CELL / 2,
  y: r * CELL + CELL / 2,
});

/** Nearest free cell to a world point (spiral search). Returns null if none. */
function snapFree(
  g: Grid,
  x: number,
  y: number,
): { c: number; r: number } | null {
  const c0 = Math.max(0, Math.min(g.cols - 1, toCol(x)));
  const r0 = Math.max(0, Math.min(g.rows - 1, toRow(y)));
  if (!g.blocked[r0 * g.cols + c0]) return { c: c0, r: r0 };
  for (let rad = 1; rad < Math.max(g.cols, g.rows); rad++) {
    for (let dr = -rad; dr <= rad; dr++) {
      for (let dc = -rad; dc <= rad; dc++) {
        if (Math.abs(dr) !== rad && Math.abs(dc) !== rad) continue;
        const c = c0 + dc;
        const r = r0 + dr;
        if (c < 0 || r < 0 || c >= g.cols || r >= g.rows) continue;
        if (!g.blocked[r * g.cols + c]) return { c, r };
      }
    }
  }
  return null;
}

/** 4-connected A* between two free cells. Returns cell-center waypoints. */
function astar(
  g: Grid,
  s: { c: number; r: number },
  t: { c: number; r: number },
): RoutePt[] | null {
  const n = g.cols * g.rows;
  const idx = (c: number, r: number) => r * g.cols + c;
  const open: number[] = [idx(s.c, s.r)];
  const came = new Int32Array(n).fill(-1);
  const gScore = new Float64Array(n).fill(Infinity);
  const fScore = new Float64Array(n).fill(Infinity);
  const inOpen = new Uint8Array(n);
  const start = idx(s.c, s.r);
  const goal = idx(t.c, t.r);
  const h = (i: number) =>
    Math.abs((i % g.cols) - t.c) + Math.abs(Math.floor(i / g.cols) - t.r);
  gScore[start] = 0;
  fScore[start] = h(start);
  inOpen[start] = 1;
  while (open.length) {
    // pop lowest f (linear scan — grids here are small, legs are few).
    let bi = 0;
    for (let k = 1; k < open.length; k++)
      if (fScore[open[k]] < fScore[open[bi]]) bi = k;
    const cur = open[bi];
    open.splice(bi, 1);
    inOpen[cur] = 0;
    if (cur === goal) {
      const path: RoutePt[] = [];
      let p = cur;
      while (p !== -1) {
        path.push(cellCenter(p % g.cols, Math.floor(p / g.cols)));
        p = came[p];
      }
      return path.reverse();
    }
    const cc = cur % g.cols;
    const cr = Math.floor(cur / g.cols);
    const nb = [
      [cc + 1, cr],
      [cc - 1, cr],
      [cc, cr + 1],
      [cc, cr - 1],
    ];
    for (const [nc, nr] of nb) {
      if (nc < 0 || nr < 0 || nc >= g.cols || nr >= g.rows) continue;
      const ni = idx(nc, nr);
      if (g.blocked[ni] && ni !== goal) continue;
      const tentative = gScore[cur] + 1;
      if (tentative < gScore[ni]) {
        came[ni] = cur;
        gScore[ni] = tentative;
        fScore[ni] = tentative + h(ni);
        if (!inOpen[ni]) {
          open.push(ni);
          inOpen[ni] = 1;
        }
      }
    }
  }
  return null;
}

/**
 * Collapse collinear runs so only the corners remain. The A* path moves on a
 * 4-connected grid, so every segment is already horizontal or vertical — this
 * keeps the route strictly orthogonal (right-angle bends, no diagonals).
 */
function simplify(pts: RoutePt[]): RoutePt[] {
  if (pts.length <= 2) return pts;
  const out: RoutePt[] = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = out[out.length - 1];
    const p = pts[i];
    const c = pts[i + 1];
    const collinear =
      (a.x === p.x && p.x === c.x) || (a.y === p.y && p.y === c.y);
    if (!collinear) out.push(p);
  }
  out.push(pts[pts.length - 1]);
  return out;
}

/** Interior cells of a horizontal/vertical segment are all free (endpoints,
 * which may sit inside a booth, are ignored). */
function segClear(g: Grid, a: RoutePt, b: RoutePt): boolean {
  const dist = Math.hypot(b.x - a.x, b.y - a.y);
  const steps = Math.max(1, Math.ceil(dist / (CELL / 2)));
  for (let i = 1; i < steps; i++) {
    const x = a.x + ((b.x - a.x) * i) / steps;
    const y = a.y + ((b.y - a.y) * i) / steps;
    const c = toCol(x);
    const r = toRow(y);
    if (c < 0 || r < 0 || c >= g.cols || r >= g.rows) return false;
    if (g.blocked[r * g.cols + c]) return false;
  }
  return true;
}

/** Replace any diagonal segment (e.g. a booth-center → aisle stub) with an
 * L-shaped right-angle bend so the whole line stays orthogonal. */
function orthogonalize(g: Grid, pts: RoutePt[]): RoutePt[] {
  if (pts.length < 2) return pts;
  const out: RoutePt[] = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const a = out[out.length - 1];
    const b = pts[i];
    if (a.x !== b.x && a.y !== b.y) {
      const e1 = { x: b.x, y: a.y };
      const e2 = { x: a.x, y: b.y };
      const ok1 = segClear(g, a, e1) && segClear(g, e1, b);
      const ok2 = segClear(g, a, e2) && segClear(g, e2, b);
      out.push(ok1 || !ok2 ? e1 : e2);
    }
    out.push(b);
  }
  return out;
}

/**
 * Full walking polyline through aisles for an ordered list of stops
 * (entrance, booths…, exit). Falls back to a direct segment for any leg the
 * grid can't route. Returns [] when fewer than two stops.
 */
export function aisleRoute(
  stops: RoutePt[],
  rects: RouteRect[],
  width: number,
  height: number,
): RoutePt[] {
  if (stops.length < 2) return [];
  const g = buildGrid(rects, width, height);
  // Each stop's access point is the nearest aisle cell — we route between those,
  // never into the booth centre. Going to the centre and back would draw an
  // in-and-out spike at every stop (the "tangle"); staying in the aisle and
  // passing the booth avoids it entirely.
  const access = stops.map((s) => snapFree(g, s.x, s.y));
  const poly: RoutePt[] = [stops[0]];
  for (let i = 1; i < stops.length; i++) {
    const a = access[i - 1];
    const b = access[i];
    let leg: RoutePt[] | null = null;
    if (a && b) {
      const grid = astar(g, a, b);
      if (grid) leg = simplify(grid);
    }
    if (leg && leg.length) {
      for (const p of leg) poly.push(p);
    } else {
      poly.push(stops[i]); // fallback: straight (rare)
    }
  }
  poly.push(stops[stops.length - 1]);
  // force strictly orthogonal bends, then collapse near-duplicate points
  const ortho = simplify(orthogonalize(g, poly));
  return ortho.filter(
    (p, i) =>
      i === 0 || Math.hypot(p.x - ortho[i - 1].x, p.y - ortho[i - 1].y) > 1,
  );
}
