// ---------------------------------------------------------------------------
// Venue floorplans. SIBF geometry is traced from the official interactive map
// (sibf.kr/page/22) — real stand codes, exact varied rectangles, zone colors —
// loaded from floorplan-sibf.json. The map is drawn to match the printed plan;
// booth content (detail/route) is keyed by the real stand code.
// ---------------------------------------------------------------------------
import sibf from "@/lib/floorplan-sibf.json";

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
    }
  | { type: "info"; x: number; y: number; text: string }
  | { type: "wc"; x: number; y: number }
  | { type: "arrowsV"; x: number; y1: number; y2: number };

/** A selectable gate the visitor can set as their route start or end. */
export interface FloorplanGate {
  id: string;
  label: string;
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
  const booths: FloorplanBooth[] = sibf.booths.map((b) => ({
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
  // Gates the visitor can pick as their own entrance / exit on the route screen.
  const gates: FloorplanGate[] = [
    { id: "in", label: "입구", x: entrance.x, y: entrance.y },
    { id: "out", label: "출구", x: exit.x, y: exit.y },
    { id: "main", label: "입·출구(메인)", x: 2980, y: 1140 },
  ];
  decor.push(
    { type: "entrance", x: 2980, y: 1140, text: "입·출구", dir: "left" },
    { type: "entrance", x: entrance.x, y: entrance.y, text: "입구", dir: "up" },
    { type: "entrance", x: exit.x, y: exit.y, text: "출구", dir: "up" },
    { type: "info", x: 2880, y: 3300, text: "안내" },
    { type: "info", x: 3060, y: 1300, text: "안내" },
    { type: "arrowsV", x: 1760, y1: 1810, y2: 1945 },
  );
  for (const w of sibf.wc ?? []) decor.push({ type: "wc", x: w.x, y: w.y });

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

export const FLOORPLANS: Record<string, Floorplan> = {
  "sibf-2026": buildSibf(),
};
