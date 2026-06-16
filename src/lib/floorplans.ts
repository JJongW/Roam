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

export interface Floorplan {
  /** Route start (entrance) / end (exit) points. */
  entrance?: { x: number; y: number };
  exit?: { x: number; y: number };
  width: number;
  height: number;
  halls: FloorplanHall[];
  decor: FloorplanDecor[];
  booths: FloorplanBooth[];
}

const ZONE: Record<string, string> = {
  general: "#dcdee3",
  art: "#ff7a33",
  highlight: "#f5b500",
  lounge: "#4cb8e8",
  special: "#8c82c8",
};

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
      (b as { color?: string }).color ??
      ZONE[(b as { zone?: string }).zone ?? "general"] ??
      ZONE.general,
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
  decor.push(
    { type: "entrance", x: 2980, y: 1140, text: "입·출구", dir: "left" },
    { type: "entrance", x: entrance.x, y: entrance.y, text: "입구", dir: "up" },
    { type: "entrance", x: exit.x, y: exit.y, text: "출구", dir: "up" },
    { type: "info", x: 2880, y: 3300, text: "안내" },
    { type: "info", x: 3060, y: 1300, text: "안내" },
    { type: "arrowsV", x: 1760, y1: 1810, y2: 1945 },
  );
  for (const w of sibf.wc ?? []) decor.push({ type: "wc", x: w.x, y: w.y });

  return {
    entrance,
    exit,
    width: sibf.width,
    height: sibf.height,
    halls,
    decor,
    booths,
  };
}

export const FLOORPLANS: Record<string, Floorplan> = {
  "sibf-2026": buildSibf(),
};
