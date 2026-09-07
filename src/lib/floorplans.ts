// ---------------------------------------------------------------------------
// Venue floorplans. SIBF geometry is traced from the official interactive map
// (sibf.kr/page/22) — real stand codes, exact varied rectangles, zone colors —
// loaded from floorplan-sibf.json. The map is drawn to match the printed plan;
// booth content (detail/route) is keyed by the real stand code.
// ---------------------------------------------------------------------------
import sibf from "@/lib/floorplan-sibf.json";
import sif from "@/lib/floorplan-sif.json";
import ha from "@/lib/floorplan-house-archive.json";
import coexHallC from "@/lib/venues/coex-hall-c.json";
import coexPlatz from "@/lib/venues/coex-platz.json";
import coexHallA from "@/lib/venues/coex-hall-a.json";
import coexHallB1 from "@/lib/venues/coex-hall-b1.json";
import coexHallB2 from "@/lib/venues/coex-hall-b2.json";
import coexHallD from "@/lib/venues/coex-hall-d.json";
import coexMagok1F from "@/lib/venues/coex-magok-1f.json";
import { composeFloorplan, type Layout, type Venue } from "@/lib/floorplan/compose";

export interface FloorplanBooth {
  code: string;
  x: number;
  y: number;
  w: number;
  h: number;
  color?: string;
}

export interface FloorplanHall {
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export type FloorplanDecor =
  | {
      type: "label";
      x: number;
      y: number;
      text: string;
      size?: number;
      anchor?: "start" | "middle" | "end";
    }
  | { type: "header"; x: number; y: number; w: number; h: number; text: string }
  | {
      type: "entrance";
      x: number;
      y: number;
      text: string;
      dir: "up" | "down" | "left" | "right";
      /** 알약 크기 배율(기본 1) — 부스가 촘촘한 좁은 도면에 쓸 때 줄인다. */
      size?: number;
    }
  | { type: "info"; x: number; y: number; text: string }
  | { type: "wc"; x: number; y: number }
  | {
      type: "arrowsV";
      x: number;
      y1: number;
      y2: number;
      /** 화살촉·선 굵기 배율(기본 1) — 좁은 공간에 쓸 때 줄인다. */
      size?: number;
    };

/** A selectable gate the visitor can set as their route start or end. */
export interface FloorplanGate {
  id: string;
  label: string;
  /** Whether this gate can serve as an entrance ("in") or exit ("out"). The
   *  start picker lists only "in" gates, the exit picker only "out" gates. */
  kind: "in" | "out";
  x: number;
  y: number;
}

export interface Floorplan {
  /** Default route start (entrance) / end (exit) points. */
  entrance?: { x: number; y: number };
  exit?: { x: number; y: number };
  /** Gates the visitor can choose from as entrance / exit on the route screen. */
  gates?: FloorplanGate[];
  width: number;
  height: number;
  halls: FloorplanHall[];
  decor: FloorplanDecor[];
  booths: FloorplanBooth[];
  /** Walkable interior (halls + connecting passage + gate aprons), centre-based
   *  rects. The router blocks anything outside this union; the map shades the
   *  exterior as walls. */
  interior?: FloorplanRect[];
}

/** A walkable-area rectangle (centre-based). */
export interface FloorplanRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const ZONE: Record<string, string> = {
  general: "#dcdee3",
  art: "#ff7a33",
  highlight: "#f5b500",
  lounge: "#4cb8e8",
  special: "#8c82c8",
};

// Facility/special-event stands (lounge/stage/주제전시 …) read as a distinct,
// darker neutral gray — recognisably different from normal stands (#dcdee3)
// without using vivid hues that collide with the 방문/이따 status colors.
const FACILITY_FILL = "#aeb4bf";

function bbox(rects: { x: number; y: number; w: number; h: number }[]) {
  const pad = 40;
  const xs1 = rects.map((r) => r.x - r.w / 2);
  const xs2 = rects.map((r) => r.x + r.w / 2);
  const ys1 = rects.map((r) => r.y - r.h / 2);
  const ys2 = rects.map((r) => r.y + r.h / 2);
  const x = Math.min(...xs1) - pad;
  const y = Math.min(...ys1) - pad;
  return { x, y, w: Math.max(...xs2) + pad - x, h: Math.max(...ys2) + pad - y };
}

function buildSibf(): Floorplan {
  // displayZone 부스(좌표 미트레이스, 존으로만 표시 — 예: 책마을 B4xx)는
  // 지도에 개별 사각형으로 그리지 않는다. 부스 리스트/검색/상세엔 존재하고,
  // 선택 시 해당 존 위치로 표시된다(좌표는 존 중심). 여기선 제외.
  const booths: FloorplanBooth[] = sibf.booths
    .filter((b) => !(b as { displayZone?: string }).displayZone)
    .map((b) => ({
      code: b.code,
      x: b.x,
      y: b.y,
      w: b.w,
      h: b.h,
      color:
        (b as { kind?: string }).kind === "facility"
          ? FACILITY_FILL
          : ((b as { color?: string }).color ??
            ZONE[(b as { zone?: string }).zone ?? "general"] ??
            ZONE.general),
    }));

  const aRects = booths.filter((b) => b.code[0] === "A");
  const bRects = booths.filter((b) => b.code[0] === "B");
  const halls: FloorplanHall[] = [];
  if (aRects.length) halls.push({ name: "Hall A", ...bbox(aRects) });
  if (bRects.length) halls.push({ name: "Hall B1", ...bbox(bRects) });

  // Block header bars (black on the official map) become labels.
  const decor: FloorplanDecor[] = sibf.headers.map((h) => ({
    type: "header" as const,
    x: h.x,
    y: h.y,
    w: h.w,
    h: h.h,
    text: h.code,
  }));

  // Entrances / exits, info desks, toilets and the inter-hall passage.
  // Positions kept clear of booth rectangles (no overlap).
  const entrance = { x: 1480, y: 3320 };
  const exit = { x: 660, y: 3320 };
  // Gates the visitor can pick as their own entrance / exit. Each is labelled
  // with its hall + 입구/출구 so it's clear *which* door. B1 has its own 입구/출구
  // (split from the old combined "메인").
  const bIn = { x: 2980, y: 1078 };
  const bOut = { x: 2980, y: 1204 };
  const gates: FloorplanGate[] = [
    { id: "a-in", label: "A홀 입구", kind: "in", x: entrance.x, y: entrance.y },
    { id: "a-out", label: "A홀 출구", kind: "out", x: exit.x, y: exit.y },
    { id: "b-in", label: "B1홀 입구", kind: "in", x: bIn.x, y: bIn.y },
    { id: "b-out", label: "B1홀 출구", kind: "out", x: bOut.x, y: bOut.y },
  ];
  decor.push(
    // A홀 (bottom): 입구 arrow points up (into hall), 출구 down (outward).
    {
      type: "entrance",
      x: entrance.x,
      y: entrance.y,
      text: "A홀 입구",
      dir: "up",
    },
    { type: "entrance", x: exit.x, y: exit.y, text: "A홀 출구", dir: "down" },
    // B1홀 (right edge): 입구 points left (into hall), 출구 right (outward).
    { type: "entrance", x: bIn.x, y: bIn.y, text: "B1홀 입구", dir: "left" },
    { type: "entrance", x: bOut.x, y: bOut.y, text: "B1홀 출구", dir: "right" },
    { type: "info", x: 2880, y: 3300, text: "안내" },
    { type: "arrowsV", x: 1760, y1: 1810, y2: 1945 },
  );
  // Toilets are edge facilities — they belong tight against a hall wall in the
  // perimeter aisle, not floating in the booth grid. Snap each marker to the
  // nearest wall, then slide ALONG that wall to clear any booth it overlaps.
  const WALL_INSET = 20; // marker centre distance from the wall (into the margin)
  const GAP = 6;
  const onBooth = (x: number, y: number) =>
    booths.some(
      (b) =>
        x >= b.x - b.w / 2 - GAP &&
        x <= b.x + b.w / 2 + GAP &&
        y >= b.y - b.h / 2 - GAP &&
        y <= b.y + b.h / 2 + GAP,
    );
  const placeWc = (p: { x: number; y: number }) => {
    let best = halls[0];
    let bestD = Infinity;
    for (const h of halls) {
      const cx = Math.max(h.x, Math.min(p.x, h.x + h.w));
      const cy = Math.max(h.y, Math.min(p.y, h.y + h.h));
      const d = (cx - p.x) ** 2 + (cy - p.y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = h;
      }
    }
    if (!best) return p;
    const h = best;
    let x = Math.max(h.x + WALL_INSET, Math.min(p.x, h.x + h.w - WALL_INSET));
    let y = Math.max(h.y + WALL_INSET, Math.min(p.y, h.y + h.h - WALL_INSET));
    // Pin to the nearest of the four walls.
    const dl = x - h.x;
    const dr = h.x + h.w - x;
    const dt = y - h.y;
    const db = h.y + h.h - y;
    const m = Math.min(dl, dr, dt, db);
    const vertical = m === dl || m === dr; // left/right wall → slide in y
    if (m === dl) x = h.x + WALL_INSET;
    else if (m === dr) x = h.x + h.w - WALL_INSET;
    else if (m === dt) y = h.y + WALL_INSET;
    else y = h.y + h.h - WALL_INSET;
    // Slide along the wall to clear booths.
    if (onBooth(x, y)) {
      const along: Array<[number, number]> = vertical
        ? [
            [0, 1],
            [0, -1],
          ]
        : [
            [1, 0],
            [-1, 0],
          ];
      for (let rad = 16; rad <= 1400; rad += 16) {
        for (const [dx, dy] of along) {
          const nx = x + dx * rad;
          const ny = y + dy * rad;
          if (
            nx >= h.x &&
            nx <= h.x + h.w &&
            ny >= h.y &&
            ny <= h.y + h.h &&
            !onBooth(nx, ny)
          )
            return { x: nx, y: ny };
        }
      }
    }
    return { x, y };
  };
  for (const w of sibf.wc ?? []) {
    const p = placeWc(w);
    decor.push({ type: "wc", x: p.x, y: p.y });
  }

  // Walkable interior: each hall (padded so perimeter aisles stay open), the
  // passage that bridges the two halls, and short aprons reaching the gates.
  // The router blocks everything outside this union, so the line can't leave
  // the building; the map shades the exterior to read as walls.
  const edges = (
    x1: number,
    y1: number,
    x2: number,
    y2: number,
  ): FloorplanRect => ({
    x: (x1 + x2) / 2,
    y: (y1 + y2) / 2,
    w: x2 - x1,
    h: y2 - y1,
  });
  const PAD = 72;
  const interior: FloorplanRect[] = [
    // Hall A (bottom) + Hall B (top), padded.
    edges(193 - PAD, 1965 - PAD, 2824 + PAD, 3204 + PAD),
    edges(1301 - PAD, 542 - PAD, 2719 + PAD, 1781 + PAD),
    // Passage bridging A↔B (their shared x-span across the gap).
    edges(1301, 1740, 2719, 2010),
    // Entrance/exit apron below Hall A.
    edges(540, 3150, 1620, 3420),
    // Main gate apron right of Hall B.
    edges(2680, 1020, 3090, 1260),
  ];

  return {
    entrance,
    exit,
    gates,
    width: sibf.width,
    height: sibf.height,
    halls,
    decor,
    booths,
    interior,
  };
}

/**
 * 전시 slug → 도면.
 *
 * SIBF만 전용 build 함수를 쓴다 — 손 트레이싱한 **개략도**라 비례가 실제와 안
 * 맞고(A홀 종횡비 2.124 : 실측 2.000, B1은 아예 안 맞음) 미터로 환산이 성립하지
 * 않아서 venue 위에 얹을 수 없다. 도면을 다시 뽑으면 나머지처럼 합성으로 옮긴다.
 *
 * 나머지는 전부 `venue + layout` 합성이다. 새 전시를 붙일 때 벽·입구·화장실을
 * 다시 적지 않는다 — 장소가 이미 안다. 여기 한 줄과 layout JSON 하나가 전부다.
 */
const VENUES: Record<string, Venue> = {
  "coex-hall-a": coexHallA as Venue,
  "coex-hall-b1": coexHallB1 as Venue,
  "coex-hall-b2": coexHallB2 as Venue,
  "coex-hall-c": coexHallC as Venue,
  "coex-hall-d": coexHallD as Venue,
  "coex-platz": coexPlatz as Venue,
  "coex-magok-1f": coexMagok1F as Venue,
};

function compose(layout: unknown): Floorplan {
  const l = layout as Layout;
  const venue = VENUES[l.venue];
  if (!venue) throw new Error(`알 수 없는 장소: ${l.venue}`);
  return composeFloorplan(l, venue);
}

/** 전시 slug → 그 전시가 쓰는 장소. 도면과 함께 내보내야 클라이언트가 픽셀이 아닌
 *  미터로 계산할 수 있다(SIBF는 venue 위에 못 얹은 개략도라 없다). */
export const VENUE_OF: Record<string, Venue> = {
  "sif-2026": VENUES[(sif as { venue: string }).venue],
  "house-archive-2026": VENUES[(ha as { venue: string }).venue],
};

export const FLOORPLANS: Record<string, Floorplan> = {
  "sibf-2026": buildSibf(), // 예외 — 개략도
  "sif-2026": compose(sif),
  "house-archive-2026": compose(ha),
};
