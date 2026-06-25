"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Minus, Plus, Locate, RotateCw } from "lucide-react";
import { cn, clamp } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { Booth, Category, Hall, Point } from "@/lib/types";
import type { Floorplan } from "@/lib/floorplans";
import { aisleRoute } from "@/lib/aisle-route";

// Fallback booth box when no floorplan geometry is supplied.
const BOOTH_W = 72;
const BOOTH_H = 62;
// Visual inset per booth so adjacent stands keep a gap (aisle) between them —
// the traced coordinates pack booths edge-to-edge.
const BOOTH_GAP = 3;

/** Crowd heat steps, quiet → very busy. Distinct hues (yellow→red), not just one
 *  orange at varying opacity, so the four levels read apart at a glance. Drawn
 *  with mix-blend multiply so a booth's name still shows through the tint. */
export const HEAT_TIERS = [
  { key: "여유", fill: "#facc15", opacity: 0.55 },
  { key: "보통", fill: "#fb923c", opacity: 0.62 },
  { key: "혼잡", fill: "#f97316", opacity: 0.74 },
  { key: "매우 혼잡", fill: "#dc2626", opacity: 0.85 },
] as const;

/** Wrap a label into up to `maxLines` lines of ~`perLine` chars (word-first,
 *  hard-break long words). Used for facility booths that show their full name. */
function wrapLabel(text: string, perLine: number, maxLines: number): string[] {
  const lines: string[] = [];
  let cur = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    let w = word;
    while (w.length > perLine) {
      if (cur) {
        lines.push(cur);
        cur = "";
      }
      lines.push(w.slice(0, perLine));
      w = w.slice(perLine);
    }
    if (!cur) cur = w;
    else if (cur.length + 1 + w.length <= perLine) cur += " " + w;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = kept[maxLines - 1].slice(0, perLine - 1) + "…";
    return kept;
  }
  return lines;
}

/** Unit vector from a toward b. */
function unit(a: { x: number; y: number }, b: { x: number; y: number }) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: dx / len, y: dy / len };
}

interface MapProps {
  width: number;
  height: number;
  booths: Booth[];
  categories: Category[];
  halls?: Hall[];
  selectedId?: string | null;
  routeOrder?: string[]; // ordered booth ids → draws path
  visitedIds?: string[];
  skippedIds?: string[];
  position?: Point | null;
  /** Hand-traced venue geometry; when set, booths render at exact rects. */
  floorplan?: Floorplan;
  /** Override the route start/end points (visitor-chosen gates). Falls back to
   *  the floorplan's default entrance/exit. */
  entrance?: Point | null;
  exit?: Point | null;
  /** Zoom to fill height (pan horizontally) instead of fitting the whole venue. */
  fillHeight?: boolean;
  /** Initial point to center on when fillHeight is set. */
  focus?: Point | null;
  onSelect?: (boothId: string) => void;
  onMapTap?: (p: Point) => void;
  /** Fired on pointer-down (to collapse overlays like the bottom sheet). */
  onInteractStart?: () => void;
  /** Fired when an actual pan/pinch movement begins (to hide map chrome). */
  onMoveStart?: () => void;
  /** Fired when a pan/pinch gesture ends (to restore map chrome after a beat). */
  onMoveEnd?: () => void;
  /** Booth id to pan-center on when it changes (e.g. a search result). */
  centerOn?: string | null;
  /** Portrait only: px height the bottom popup covers. A selected/centered booth
   *  is biased upward by this so it lands in the visible band above the popup,
   *  not hidden behind it. Ignored in landscape (popup sits at the side). */
  focusBottomInset?: number;
  /** Crowd heatmap: per-booth inclusion counts + per-corridor (pair) counts.
   *  When set, popular booths are tinted and busy corridors thickened. */
  heat?: Record<string, number>;
  heatPairs?: { from: string; to: string; count: number }[];
  className?: string;
  /** Insets the interactive/measured viewport (e.g. to clear an overlapping
   *  bottom sheet) so fit + clamp use the visible area, not the full container.
   *  Tailwind positioning classes; defaults to filling the container. */
  viewportClassName?: string;
  /** Position for the zoom controls cluster — override to clear an overlapping
   *  bottom sheet / nav. Defaults to bottom-right. */
  controlsClassName?: string;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
  color?: string;
}

export function ExhibitionMap({
  width: widthProp,
  height: heightProp,
  booths,
  categories,
  halls = [],
  selectedId,
  routeOrder,
  visitedIds = [],
  skippedIds = [],
  position,
  floorplan,
  entrance,
  exit,
  fillHeight = false,
  focus,
  onSelect,
  onMapTap,
  onInteractStart,
  onMoveStart,
  onMoveEnd,
  centerOn,
  focusBottomInset = 0,
  heat,
  heatPairs,
  className,
  viewportClassName = "inset-0",
  controlsClassName = "bottom-4 right-3",
}: MapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  // Effective canvas size: floorplan dims override the props when present.
  // (Declared early — the imperative transform/rotation helpers below need it.)
  const width = floorplan?.width ?? widthProp;
  const height = floorplan?.height ?? heightProp;
  // Live pan/zoom, driven imperatively so dragging never re-renders the (heavy)
  // booth layer — only the SVG transform changes on each move.
  const view = useRef<{ scale: number; offset: Point }>({
    scale: 1,
    offset: { x: 0, y: 0 },
  });
  // Once the visitor pans/zooms/taps, stop auto-refitting on container resize
  // (chrome show/hide, status chips appearing) — keep their chosen view.
  const userAdjusted = useRef(false);
  const moveStartFired = useRef(false);
  // Map view rotation in 90° steps. Stored as an ever-increasing degree count so
  // each press animates forward a quarter turn (270°→360°, not 270°→0°). The
  // whole map (booths + their labels) rotates rigidly, so nothing overflows its
  // box; footprint() uses this mod 180 to know if width/height are swapped.
  const rotationRef = useRef(0);
  const [rotation, setRotation] = useState(0);
  // Counter-rotate a label around its own anchor so it stays upright (readable)
  // while the map turns — the anchor is the pivot, so the text doesn't drift,
  // only its orientation is cancelled. Returns undefined at 0° (no transform).
  const upright = (ax: number, ay: number): string | undefined =>
    rotation % 360 === 0 ? undefined : `rotate(${-rotation} ${ax} ${ay})`;

  // Vertical pan target that keeps a focused booth above the bottom popup.
  // Portrait: shift up by half the popup inset (capped so it never overshoots);
  // landscape: no bias (popup sits at the side, doesn't cover the map bottom).
  function focusCenterY(el: HTMLElement, gy: number, scale: number): number {
    const cw = el.clientWidth;
    const ch = el.clientHeight;
    const landscape = cw > ch * 1.4;
    const bias = landscape ? 0 : Math.min(focusBottomInset, ch * 0.5);
    return (ch - bias) / 2 - gy * scale;
  }

  // Write the current view to the DOM. `animate` adds a short transition for
  // programmatic moves (tap-zoom, buttons); drags pass false for instant feel.
  const transformString = useCallback(() => {
    const { scale, offset } = view.current;
    const cx = width / 2;
    const cy = height / 2;
    // Pan → zoom → rotate-about-centre (transform-origin is 0 0, so the rotation
    // is centred manually). Booth boxes and their labels rotate together.
    return `translate(${offset.x}px, ${offset.y}px) scale(${scale}) translate(${cx}px, ${cy}px) rotate(${rotationRef.current}deg) translate(${-cx}px, ${-cy}px)`;
  }, [width, height]);

  const applyView = useCallback(
    (animate = false) => {
      const el = svgRef.current;
      if (!el) return;
      el.style.transition = animate ? "transform 220ms ease-out" : "none";
      el.style.transform = transformString();
    },
    [transformString],
  );
  // Re-assert just the transform after a React re-render (which would otherwise
  // drop the imperatively-set inline style). Leaves `transition` untouched so an
  // in-flight animated move (tap-zoom, centre-on) isn't cut short.
  const reassertTransform = useCallback(() => {
    const el = svgRef.current;
    if (!el) return;
    el.style.transform = transformString();
  }, [transformString]);
  // Active touch/mouse points for pan (1) + pinch (2) gestures.
  const pointers = useRef<Map<number, Point>>(new Map());
  const gesture = useRef<{
    mode: "pan" | "pinch";
    startOffset: Point;
    startScale: number;
    startDist: number;
    /** Pinch focal point in world (map) coordinates. */
    focalWorld: Point;
    /** Pan: pointer position at gesture start (container coords). */
    startPoint: Point;
    moved: boolean;
  } | null>(null);
  const lastTap = useRef<{ t: number; x: number; y: number }>({
    t: 0,
    x: 0,
    y: 0,
  });

  // Axis-aligned footprint of the (possibly rotated) map, in world units. At 90°
  // / 270° the width and height swap — fit + clamp use this to frame and bound
  // the rotated map correctly. Rotation always pivots about the map centre, so
  // that centre stays fixed regardless of angle.
  const footprint = useCallback(() => {
    const r = ((rotationRef.current % 180) + 180) % 180;
    return r === 90 ? { fw: height, fh: width } : { fw: width, fh: height };
  }, [width, height]);

  // World ↔ rotated-content mapping. The CSS transform rotates the map about its
  // centre, so pan/zoom (screen-space) stay correct, but anything mapping a
  // booth's world x/y to the screen — tap hit-testing, centre-on — must apply
  // the same rotation. `toContent` rotates a world point into the post-rotation
  // frame; `fromContent` inverts it.
  const spin = (dx: number, dy: number, deg: number): Point => {
    const a = (deg * Math.PI) / 180;
    const c = Math.cos(a);
    const s = Math.sin(a);
    return { x: dx * c - dy * s, y: dx * s + dy * c };
  };
  const toContent = useCallback(
    (w: Point): Point => {
      const cx = width / 2;
      const cy = height / 2;
      const r = spin(w.x - cx, w.y - cy, rotationRef.current);
      return { x: cx + r.x, y: cy + r.y };
    },
    [width, height],
  );
  const fromContent = useCallback(
    (p: Point): Point => {
      const cx = width / 2;
      const cy = height / 2;
      const r = spin(p.x - cx, p.y - cy, -rotationRef.current);
      return { x: cx + r.x, y: cy + r.y };
    },
    [width, height],
  );

  // Booth geometry: from the floorplan (by code) when available, else a
  // uniform fallback box at the booth's stored x/y.
  const rectByCode = new Map(
    (floorplan?.booths ?? []).map((fb) => [fb.code, fb]),
  );
  const geomOf = (b: Booth): Rect => {
    const fb = b.code ? rectByCode.get(b.code) : undefined;
    if (fb) return { x: fb.x, y: fb.y, w: fb.w, h: fb.h, color: fb.color };
    return { x: b.x, y: b.y, w: BOOTH_W, h: BOOTH_H };
  };

  const catById = new Map(categories.map((c) => [c.id, c]));
  const boothById = new Map(booths.map((b) => [b.id, b]));
  const visitedSet = new Set(visitedIds);
  const skippedSet = new Set(skippedIds);
  // Paint the selected booth LAST so its name label (drawn above the rect) is
  // never covered by a booth sitting above it in document order.
  const renderBooths = selectedId
    ? [
        ...booths.filter((b) => b.id !== selectedId),
        ...booths.filter((b) => b.id === selectedId),
      ]
    : booths;
  const orderById = new Map(routeOrder?.map((id, i) => [id, i]));

  // Hall containers. From the floorplan when present; otherwise a bounding box
  // computed from booth positions.
  const hallRegions = floorplan
    ? floorplan.halls.map((h) => ({
        label: h.name,
        x: h.x,
        y: h.y,
        w: h.w,
        h: h.h,
      }))
    : halls
        .map((hall) => {
          const inHall = booths.filter((b) => b.hallId === hall.id);
          if (inHall.length === 0) return null;
          const xs = inHall.map((b) => b.x);
          const ys = inHall.map((b) => b.y);
          const padX = BOOTH_W / 2 + 16;
          const padTop = BOOTH_H / 2 + 34;
          const padBot = BOOTH_H / 2 + 16;
          const x = Math.min(...xs) - padX;
          const y = Math.min(...ys) - padTop;
          return {
            label: hall.name,
            x,
            y,
            w: Math.max(...xs) + padX - x,
            h: Math.max(...ys) + padBot - y,
          };
        })
        .filter(
          (
            r,
          ): r is {
            label: string;
            x: number;
            y: number;
            w: number;
            h: number;
          } => r !== null,
        );

  // Fit map to container. Guards against 0-size (layout not ready).
  const fit = useCallback(
    (animate = false) => {
      const el = containerRef.current;
      if (!el) return;
      const cw = el.clientWidth;
      const ch = el.clientHeight;
      if (cw < 2 || ch < 2) return;
      // After the visitor has taken control, a resize (chrome hiding, status
      // chips appearing) must NOT snap back to the fitted view — just re-clamp
      // so their pan/zoom stays within the new bounds.
      const { fw, fh } = footprint();
      if (userAdjusted.current) {
        const s = view.current.scale;
        const o = view.current.offset;
        view.current.offset = {
          x: clamp(o.x, Math.min(0, cw - fw * s), Math.max(0, cw - fw * s)),
          y: clamp(o.y, Math.min(0, ch - fh * s), Math.max(0, ch - fh * s)),
        };
        applyView(animate);
        return;
      }
      const contain = Math.min(cw / fw, ch / fh) * 0.96;
      // fillHeight: zoom so the map fills the viewport vertically (pan horizontally),
      // but never below the contain scale.
      const s = fillHeight ? Math.max(contain, (ch / fh) * 0.92) : contain;
      // Centre formula pivots on the map centre (width/2,height/2) — the same
      // point the rotation turns about — so it holds at every angle.
      const cx = focus ? focus.x : width / 2;
      const cy = focus ? focus.y : height / 2;
      const scaledH = fh * s;
      view.current = {
        scale: s,
        offset: {
          x: clamp(
            cw / 2 - cx * s,
            Math.min(0, cw - fw * s),
            Math.max(0, cw - fw * s),
          ),
          // When the whole map is shorter than the viewport, anchor it near the
          // top (not vertical-centred) so there's no large empty band above.
          y:
            !focus && scaledH < ch
              ? 12
              : clamp(
                  ch / 2 - cy * s,
                  Math.min(0, ch - scaledH),
                  Math.max(0, ch - scaledH),
                ),
        },
      };
      applyView(animate);
    },
    [width, height, fillHeight, focus?.x, focus?.y, applyView, footprint],
  );

  // The explicit "전체 보기" control: drop the user-adjusted lock and re-fit.
  const resetView = useCallback(() => {
    userAdjusted.current = false;
    fit(true);
  }, [fit]);

  // Rotate the whole map a quarter-turn. Re-fit afterwards so the rotated map is
  // re-centred and scaled to the viewport — it can never spill off-screen, and
  // the transform transition makes the turn animate smoothly.
  const rotate90 = useCallback(() => {
    rotationRef.current += 90;
    setRotation(rotationRef.current);
    userAdjusted.current = false;
    fit(true);
  }, [fit]);

  // Re-fit whenever the container is (re)sized — handles late layout, rotation, etc.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    fit();
    const ro = new ResizeObserver(() => fit());
    ro.observe(el);
    return () => ro.disconnect();
  }, [fit]);

  // The SVG transform is driven imperatively (not via JSX style), so any
  // re-render that recreates inline styles would otherwise drop it. Re-assert
  // the current view after every render — cheap (one style write).
  useLayoutEffect(() => {
    reassertTransform();
  });

  // Keep the map within the viewport so it can never be panned out of sight.
  const clampOffset = useCallback(
    (off: Point, s: number): Point => {
      const el = containerRef.current;
      if (!el) return off;
      const cw = el.clientWidth;
      const ch = el.clientHeight;
      const { fw, fh } = footprint();
      return {
        x: clamp(off.x, Math.min(0, cw - fw * s), Math.max(0, cw - fw * s)),
        y: clamp(off.y, Math.min(0, ch - fh * s), Math.max(0, ch - fh * s)),
      };
    },
    [footprint],
  );

  // Zoom by a factor, keeping the given container-point fixed (defaults to center).
  const zoomBy = useCallback(
    (factor: number, focal?: Point, animate = false) => {
      const el = containerRef.current;
      if (!el) return;
      const fx = focal?.x ?? el.clientWidth / 2;
      const fy = focal?.y ?? el.clientHeight / 2;
      const prev = view.current.scale;
      const next = clamp(prev * factor, 0.3, 4);
      const o = view.current.offset;
      view.current = {
        scale: next,
        offset: clampOffset(
          {
            x: fx - ((fx - o.x) / prev) * next,
            y: fy - ((fy - o.y) / prev) * next,
          },
          next,
        ),
      };
      userAdjusted.current = true;
      applyView(animate);
    },
    [clampOffset, applyView],
  );

  function localPoint(e: { clientX: number; clientY: number }): Point {
    const rect = containerRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  // Fire onMoveStart once per gesture, the first time real movement happens.
  function beginMove() {
    userAdjusted.current = true;
    if (!moveStartFired.current) {
      moveStartFired.current = true;
      onMoveStart?.();
    }
  }

  function onPointerDown(e: React.PointerEvent) {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    onInteractStart?.();
    const p = localPoint(e);
    pointers.current.set(e.pointerId, p);
    const pts = [...pointers.current.values()];
    const { scale, offset } = view.current;

    if (pts.length === 1) {
      moveStartFired.current = false;
      gesture.current = {
        mode: "pan",
        startOffset: offset,
        startScale: scale,
        startDist: 0,
        focalWorld: { x: 0, y: 0 },
        startPoint: p,
        moved: false,
      };
    } else if (pts.length === 2) {
      const [a, b] = pts;
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      gesture.current = {
        mode: "pinch",
        startOffset: offset,
        startScale: scale,
        startDist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
        focalWorld: {
          x: (mid.x - offset.x) / scale,
          y: (mid.y - offset.y) / scale,
        },
        startPoint: mid,
        moved: true,
      };
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, localPoint(e));
    const g = gesture.current;
    if (!g) return;
    const pts = [...pointers.current.values()];

    if (g.mode === "pinch" && pts.length >= 2) {
      const [a, b] = pts;
      const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const next = clamp((g.startScale * dist) / g.startDist, 0.3, 4);
      beginMove();
      view.current = {
        scale: next,
        offset: clampOffset(
          {
            x: mid.x - g.focalWorld.x * next,
            y: mid.y - g.focalWorld.y * next,
          },
          next,
        ),
      };
      applyView();
    } else if (g.mode === "pan") {
      const cur = pts[0];
      const dx = cur.x - g.startPoint.x;
      const dy = cur.y - g.startPoint.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) {
        g.moved = true;
        beginMove();
      }
      view.current = {
        scale: view.current.scale,
        offset: clampOffset(
          { x: g.startOffset.x + dx, y: g.startOffset.y + dy },
          view.current.scale,
        ),
      };
      applyView();
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    const wasPan = gesture.current?.mode === "pan";
    const moved = gesture.current?.moved;
    const p = pointers.current.get(e.pointerId) ?? localPoint(e);
    pointers.current.delete(e.pointerId);

    // Hand off to a single-finger pan if one pointer remains after a pinch.
    if (pointers.current.size === 1) {
      const [rest] = [...pointers.current.values()];
      gesture.current = {
        mode: "pan",
        startOffset: view.current.offset,
        startScale: view.current.scale,
        startDist: 0,
        focalWorld: { x: 0, y: 0 },
        startPoint: rest,
        moved: true,
      };
      return;
    }
    if (pointers.current.size > 0) return;
    gesture.current = null;
    // A real pan/pinch just ended → let the chrome come back.
    if (moveStartFired.current) {
      moveStartFired.current = false;
      onMoveEnd?.();
    }

    if (wasPan && !moved) {
      const now = e.timeStamp;
      const prev = lastTap.current;
      const { scale, offset } = view.current;
      const isDouble =
        now - prev.t < 300 && Math.hypot(p.x - prev.x, p.y - prev.y) < 32;
      if (isDouble) {
        // Double-tap to zoom in toward the tapped point (or out if near max).
        zoomBy(scale > 3 ? 0.55 : 1.6, p, true);
        lastTap.current = { t: 0, x: 0, y: 0 };
      } else {
        lastTap.current = { t: now, x: p.x, y: p.y };
        // Un-project the tap through pan/zoom, then un-rotate to world coords.
        const world = fromContent({
          x: (p.x - offset.x) / scale,
          y: (p.y - offset.y) / scale,
        });
        const mx = world.x;
        const my = world.y;
        // Prefer selecting the nearest booth within a finger-friendly radius.
        if (onSelect) {
          // Point-in-rect hit test against each booth's actual box.
          let hit = "";
          let hitBooth: Booth | undefined;
          for (const b of booths) {
            if (floorplan && !(b.code && rectByCode.has(b.code))) continue;
            const g = geomOf(b);
            if (
              mx >= g.x - g.w / 2 &&
              mx <= g.x + g.w / 2 &&
              my >= g.y - g.h / 2 &&
              my <= g.y + g.h / 2
            ) {
              hit = b.id;
              hitBooth = b;
              break;
            }
          }
          // Tapping a booth re-centres it WITHOUT changing zoom — the visitor's
          // own zoom ratio is preserved; only the pan moves to centre the booth.
          if (hitBooth) {
            const el = containerRef.current;
            if (el) {
              const g = geomOf(hitBooth);
              const s = view.current.scale;
              // Centre on the booth's rotated screen position, not its raw x/y.
              const cp = toContent({ x: g.x, y: g.y });
              view.current = {
                scale: s,
                offset: clampOffset(
                  {
                    x: el.clientWidth / 2 - cp.x * s,
                    y: focusCenterY(el, cp.y, s),
                  },
                  s,
                ),
              };
              userAdjusted.current = true;
              applyView(true);
            }
          }
          onSelect(hit); // empty → caller deselects
          return;
        }
        if (onMapTap && mx >= 0 && my >= 0 && mx <= width && my <= height)
          onMapTap({ x: Math.round(mx), y: Math.round(my) });
      }
    }
  }

  function onWheel(e: React.WheelEvent) {
    // Gentler step + dampened for trackpads (many small deltas) so wheel/pinch
    // zoom feels smooth rather than jumpy.
    if (e.deltaY !== 0) {
      const step = Math.min(0.08, Math.abs(e.deltaY) * 0.0016);
      zoomBy(e.deltaY < 0 ? 1 + step : 1 - step, localPoint(e));
    }
  }

  // Route line: clean orthogonal path (one bend per leg) with rounded corners —
  // no aisle detours / stubs. Adjacent or same-row/col booths connect straight.
  type Pt = { x: number; y: number };
  const routeBoothCenters: Pt[] = (routeOrder ?? [])
    .map((id) => boothById.get(id))
    .filter((b): b is Booth => Boolean(b))
    .map((b) => {
      const g = geomOf(b);
      return { x: g.x, y: g.y };
    });
  // Begin at the entrance, end at the exit. Visitor-chosen gates (entrance/exit
  // props) win; otherwise fall back to the floorplan's defaults.
  const routeStart = entrance ?? floorplan?.entrance;
  const routeEnd = exit ?? floorplan?.exit;
  const orderedRouteCenters: Pt[] =
    routeBoothCenters.length > 0 && routeStart && routeEnd
      ? [routeStart, ...routeBoothCenters, routeEnd]
      : routeBoothCenters;

  function orthWaypoints(pts: Pt[]): Pt[] {
    const out: Pt[] = [];
    for (let i = 0; i < pts.length; i++) {
      const b = pts[i];
      if (i > 0) {
        const a = pts[i - 1];
        // one right-angle bend (vertical then horizontal); skip if aligned
        if (a.x !== b.x && a.y !== b.y) out.push({ x: a.x, y: b.y });
      }
      out.push(b);
    }
    // drop collinear midpoints so straight runs stay straight
    return out.filter((p, i) => {
      if (i === 0 || i === out.length - 1) return true;
      const a = out[i - 1];
      const c = out[i + 1];
      const collinear =
        (a.x === p.x && p.x === c.x) || (a.y === p.y && p.y === c.y);
      return !collinear;
    });
  }

  // Build an SVG path string with rounded corners at every vertex.
  function roundedPathD(pts: Pt[], radius = 16): string {
    if (pts.length < 2) return "";
    if (pts.length === 2)
      return `M ${pts[0].x} ${pts[0].y} L ${pts[1].x} ${pts[1].y}`;
    let d = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 1; i < pts.length - 1; i++) {
      const p = pts[i];
      const a = pts[i - 1];
      const c = pts[i + 1];
      const r1 = Math.min(radius, Math.hypot(p.x - a.x, p.y - a.y) / 2);
      const r2 = Math.min(radius, Math.hypot(c.x - p.x, c.y - p.y) / 2);
      const u1 = unit(p, a);
      const u2 = unit(p, c);
      const e1 = { x: p.x + u1.x * r1, y: p.y + u1.y * r1 };
      const e2 = { x: p.x + u2.x * r2, y: p.y + u2.y * r2 };
      d += ` L ${e1.x.toFixed(1)} ${e1.y.toFixed(1)} Q ${p.x} ${p.y} ${e2.x.toFixed(1)} ${e2.y.toFixed(1)}`;
    }
    const last = pts[pts.length - 1];
    d += ` L ${last.x} ${last.y}`;
    return d;
  }

  // With a traced floorplan, route through the aisle gaps so the line never
  // crosses a booth. Otherwise fall back to the simple orthogonal path.
  // A* is expensive, so memoise on the route order (re-runs only when the plan
  // changes — not on every pan/zoom).
  // Pan/zoom to bring a chosen booth (e.g. a search hit) into the centre.
  useEffect(() => {
    if (!centerOn) return;
    const b = boothById.get(centerOn);
    if (!b) return;
    const el = containerRef.current;
    if (!el) return;
    const g = geomOf(b);
    const cw = el.clientWidth;
    const next = Math.max(view.current.scale, 1.4);
    const cp = toContent({ x: g.x, y: g.y });
    view.current = {
      scale: next,
      offset: clampOffset(
        { x: cw / 2 - cp.x * next, y: focusCenterY(el, cp.y, next) },
        next,
      ),
    };
    userAdjusted.current = true;
    applyView(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [centerOn]);

  const routeKey = routeOrder?.join(",");
  // Route the WHOLE path once through the aisle grid (correct, never crosses a
  // booth), then split the resulting polyline into its straight pieces. Drawing
  // the pieces in walking order lets a later one's casing + shadow cross OVER an
  // earlier one, so self-crossings ("십자") read as a bridge. (Routing per leg
  // instead would spike into every booth centre and clip the boxes.)
  const gateKey = `${routeStart?.x},${routeStart?.y},${routeEnd?.x},${routeEnd?.y}`;
  const routeSegments = useMemo(
    () => {
      const centers = orderedRouteCenters;
      if (centers.length < 2) return [];
      const rects = floorplan
        ? floorplan.booths.map((b) => ({ x: b.x, y: b.y, w: b.w, h: b.h }))
        : [];
      const wps = floorplan
        ? aisleRoute(centers, rects, width, height, floorplan.interior)
        : orthWaypoints(centers);
      const segs: string[] = [];
      for (let i = 0; i < wps.length - 1; i++) {
        const a = wps[i];
        const b = wps[i + 1];
        segs.push(
          `M ${a.x.toFixed(1)} ${a.y.toFixed(1)} L ${b.x.toFixed(1)} ${b.y.toFixed(1)}`,
        );
      }
      return segs;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [routeKey, gateKey, floorplan, width, height],
  );

  // Crowd heatmap geometry. maxHeat normalises booth tint; the top corridors
  // (most-walked pairs) are routed through the aisles and drawn as heat lines.
  const maxHeat = useMemo(
    () => Math.max(1, ...Object.values(heat ?? {})),
    [heat],
  );
  // Quantile thresholds over the non-zero counts. Tiering by rank (not by
  // count/max) keeps the four levels visible even when a few booths dwarf the
  // rest — otherwise everything but the hottest looked the same pale tint.
  const heatThresholds = useMemo(() => {
    const vals = Object.values(heat ?? {})
      .filter((v) => v > 0)
      .sort((a, b) => a - b);
    if (vals.length === 0) return null;
    const at = (p: number) =>
      vals[Math.min(vals.length - 1, Math.floor(p * vals.length))];
    return { t1: at(0.25), t2: at(0.5), t3: at(0.75) };
  }, [heat]);
  const heatLevel = (c: number): number => {
    if (!heatThresholds) return 0;
    if (c >= heatThresholds.t3) return 3;
    if (c >= heatThresholds.t2) return 2;
    if (c >= heatThresholds.t1) return 1;
    return 0;
  };
  const heatCorridors = useMemo(() => {
    if (!heatPairs?.length) return [];
    const top = [...heatPairs].sort((a, b) => b.count - a.count).slice(0, 24);
    const maxPair = Math.max(1, ...top.map((p) => p.count));
    const rects = floorplan
      ? floorplan.booths.map((b) => ({ x: b.x, y: b.y, w: b.w, h: b.h }))
      : [];
    return top
      .map((p) => {
        const a = boothById.get(p.from);
        const b = boothById.get(p.to);
        if (!a || !b) return null;
        const ga = geomOf(a);
        const gb = geomOf(b);
        const stops = [
          { x: ga.x, y: ga.y },
          { x: gb.x, y: gb.y },
        ];
        const pts = floorplan
          ? aisleRoute(stops, rects, width, height, floorplan.interior)
          : stops;
        return { d: roundedPathD(pts, 10), t: p.count / maxPair };
      })
      .filter((c): c is { d: string; t: number } => Boolean(c && c.d));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heatPairs, floorplan, width, height]);

  return (
    <div
      className={cn(
        "relative h-full w-full touch-none overflow-hidden bg-secondary/40",
        className,
      )}
    >
      <div
        ref={containerRef}
        className={cn(
          "absolute cursor-grab active:cursor-grabbing",
          viewportClassName,
        )}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={(e) => {
          pointers.current.delete(e.pointerId);
          if (pointers.current.size === 0) gesture.current = null;
        }}
        onWheel={onWheel}
        role="application"
        aria-label="전시장 지도"
      >
        <svg
          ref={svgRef}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          // Transform is applied imperatively (see applyView) so panning never
          // re-renders this subtree — only transformOrigin is React-managed.
          style={{ transformOrigin: "0 0", willChange: "transform" }}
          className="select-none"
        >
          {/* grid backdrop. No SVG filters — drop-shadow filters force costly
              re-rasterisation on every zoom and were the main pan/zoom lag. */}
          <defs>
            <pattern
              id="grid"
              width="50"
              height="50"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M50 0H0V50"
                fill="none"
                stroke="var(--border)"
                strokeWidth="1"
                opacity="0.5"
              />
            </pattern>
          </defs>
          <rect
            x="0"
            y="0"
            width={width}
            height={height}
            fill="url(#grid)"
            rx="16"
          />

          {/* Hall floor plates — each hall is one clean raised room (the venue is
              genuinely two halls). Booths sit on these; the gridded ground shows
              around them. The route's wall-containment is handled in routing, not
              drawn, so the background stays uncluttered. */}
          {hallRegions.map((r) => (
            <g key={r.label}>
              <rect
                x={r.x}
                y={r.y}
                width={r.w}
                height={r.h}
                rx="24"
                fill="var(--card)"
                stroke="var(--border)"
                strokeWidth={2}
              />
              <text
                x={r.x + 22}
                y={r.y + 34}
                fontSize="22"
                fontWeight="800"
                fill="var(--muted-foreground)"
                opacity={0.55}
                transform={upright(r.x + 22, r.y + 34)}
              >
                {r.label}
              </text>
            </g>
          ))}

          {/* crowd heat: busy corridors (drawn under booths, in the aisles) */}
          {heatCorridors.map((c, i) => (
            <path
              key={`heat-${i}`}
              d={c.d}
              fill="none"
              stroke="#f97316"
              strokeWidth={6 + c.t * 18}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={0.12 + c.t * 0.33}
            />
          ))}

          {/* route path — drawn under decor/booths so block headers, entrance
              and exit labels stay readable on top of the walking line. */}
          {routeSegments.length > 0 && (
            <g>
              {routeSegments.map((d, i) => (
                // Each leg = soft shadow + white casing + line, painted in visit
                // order. A later leg lands on top, so where it crosses an earlier
                // leg the shadow falls onto the lower line → a readable overpass.
                <g key={i}>
                  <path
                    d={d}
                    fill="none"
                    stroke="rgba(15,23,42,0.18)"
                    strokeWidth={18}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    transform="translate(0,2.5)"
                  />
                  <path
                    d={d}
                    fill="none"
                    stroke="white"
                    strokeWidth={15}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d={d}
                    fill="none"
                    stroke="var(--route-line)"
                    strokeWidth={9}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </g>
              ))}
            </g>
          )}

          {/* Start (입구) / end (출구) markers — make the route's direction and
              its entrance/exit unmistakable when a route is drawn. */}
          {routeSegments.length > 0 &&
            routeStart &&
            routeEnd &&
            (
              [
                { p: routeStart, label: "출발" },
                { p: routeEnd, label: "도착" },
              ] as const
            ).map((m) => (
              <g key={m.label} transform={upright(m.p.x, m.p.y)}>
                <circle cx={m.p.x} cy={m.p.y} r={26} fill="var(--primary)" />
                <circle
                  cx={m.p.x}
                  cy={m.p.y}
                  r={26}
                  fill="none"
                  stroke="white"
                  strokeWidth={4}
                />
                <text
                  x={m.p.x}
                  y={m.p.y}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={20}
                  fontWeight={800}
                  fill="white"
                >
                  {m.label}
                </text>
              </g>
            ))}

          {/* floorplan decor (passage arrows, info bars, entrance, labels) */}
          {floorplan?.decor.map((d, i) => {
            if (d.type === "header") {
              return (
                <g key={i} transform={upright(d.x + d.w / 2, d.y + d.h / 2)}>
                  <rect
                    x={d.x}
                    y={d.y}
                    width={d.w}
                    height={d.h}
                    rx={4}
                    fill="#2b2e35"
                  />
                  <text
                    x={d.x + d.w / 2}
                    y={d.y + d.h / 2 + d.h * 0.2}
                    textAnchor="middle"
                    fontSize={d.h * 0.52}
                    fontWeight="800"
                    fill="white"
                  >
                    {d.text}
                  </text>
                </g>
              );
            }
            if (d.type === "info") {
              return (
                <g key={i} transform={upright(d.x, d.y)}>
                  <rect
                    x={d.x - 70}
                    y={d.y - 26}
                    width={140}
                    height={52}
                    rx={26}
                    fill="#ff8a3d"
                  />
                  <text
                    x={d.x}
                    y={d.y + 11}
                    textAnchor="middle"
                    fontSize={30}
                    fontWeight="800"
                    fill="white"
                  >
                    {d.text}
                  </text>
                </g>
              );
            }
            if (d.type === "wc") {
              // Restroom marker — 남/녀 pictogram (man + divider + woman), like
              // the universal sign. Compact (smaller than a booth) and on-brand:
              // a light card chip with primary-coloured figures.
              const R = 23; // half box size
              const man = d.x - 9;
              const woman = d.x + 9;
              const headY = d.y - 11;
              const hr = 3.4;
              return (
                <g key={i} transform={upright(d.x, d.y)}>
                  <rect
                    x={d.x - R}
                    y={d.y - R}
                    width={R * 2}
                    height={R * 2}
                    rx={10}
                    fill="var(--card)"
                    stroke="var(--border)"
                    strokeWidth={1.5}
                  />
                  <g fill="var(--primary)">
                    {/* man: head + downward (broad-shoulder) torso */}
                    <circle cx={man} cy={headY} r={hr} />
                    <path
                      d={`M${man - 5.5} ${headY + 4} L${man + 5.5} ${headY + 4} L${man} ${headY + 15} Z`}
                    />
                    {/* divider */}
                    <rect
                      x={d.x - 0.9}
                      y={headY - hr}
                      width={1.8}
                      height={20}
                      rx={0.9}
                    />
                    {/* woman: head + upward (dress) torso */}
                    <circle cx={woman} cy={headY} r={hr} />
                    <path
                      d={`M${woman} ${headY + 4} L${woman - 5.5} ${headY + 15} L${woman + 5.5} ${headY + 15} Z`}
                    />
                  </g>
                </g>
              );
            }
            if (d.type === "arrowsV") {
              const cx = d.x;
              return (
                <g
                  key={i}
                  stroke="var(--muted-foreground)"
                  strokeWidth={5}
                  strokeLinecap="round"
                  opacity={0.7}
                  fill="none"
                >
                  <line
                    x1={cx}
                    y1={d.y1}
                    x2={cx}
                    y2={d.y2}
                    strokeDasharray="6 14"
                  />
                  <path
                    d={`M${cx - 16} ${d.y1 + 14} L${cx} ${d.y1} L${cx + 16} ${d.y1 + 14}`}
                  />
                  <path
                    d={`M${cx - 16} ${d.y2 - 14} L${cx} ${d.y2} L${cx + 16} ${d.y2 - 14}`}
                  />
                </g>
              );
            }
            if (d.type === "entrance") {
              const aw = 22;
              const hw = 112; // half pill width (fits "B1홀 입구")
              const arrow =
                d.dir === "left"
                  ? `M${d.x + hw} ${d.y - aw} L${d.x + hw + aw} ${d.y} L${d.x + hw} ${d.y + aw}`
                  : d.dir === "right"
                    ? `M${d.x - hw} ${d.y - aw} L${d.x - hw - aw} ${d.y} L${d.x - hw} ${d.y + aw}`
                    : d.dir === "up"
                      ? `M${d.x - aw} ${d.y + 44} L${d.x} ${d.y + 44 - aw} L${d.x + aw} ${d.y + 44}`
                      : `M${d.x - aw} ${d.y + 44} L${d.x} ${d.y + 44 + aw} L${d.x + aw} ${d.y + 44}`;
              // Single theme colour — 입구/출구 are told apart by their label
              // ("A홀 입구" / "B1홀 출구") and arrow direction, not by colour.
              const color = "var(--primary)";
              return (
                <g key={i} transform={upright(d.x, d.y)}>
                  <rect
                    x={d.x - 100}
                    y={d.y - 28}
                    width={200}
                    height={56}
                    rx={28}
                    fill={color}
                  />
                  <text
                    x={d.x}
                    y={d.y + 9}
                    textAnchor="middle"
                    fontSize={26}
                    fontWeight="800"
                    fill="white"
                  >
                    {d.text}
                  </text>
                  <path
                    d={arrow}
                    fill="none"
                    stroke={color}
                    strokeWidth={9}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </g>
              );
            }
            // label
            return (
              <text
                key={i}
                x={d.x}
                y={d.y}
                textAnchor={d.anchor ?? "start"}
                fontSize={d.size ?? 14}
                fontWeight="700"
                fill="var(--muted-foreground)"
                transform={upright(d.x, d.y)}
              >
                {d.text}
              </text>
            );
          })}

          {/* passage connecting the two halls + entrance marker (auto, non-floorplan) */}
          {!floorplan &&
            hallRegions.length === 2 &&
            (() => {
              const [top, bot] = [...hallRegions].sort((a, b) => a.y - b.y);
              const x1 = Math.max(top.x, bot.x);
              const x2 = Math.min(top.x + top.w, bot.x + bot.w);
              if (x2 <= x1) return null;
              const cx = (x1 + x2) / 2;
              const yTop = top.y + top.h;
              const yBot = bot.y;
              const my = (yTop + yBot) / 2;
              return (
                <g>
                  <line
                    x1={cx}
                    y1={yTop - 4}
                    x2={cx}
                    y2={yBot + 4}
                    stroke="var(--muted-foreground)"
                    strokeWidth={2}
                    strokeDasharray="2 6"
                    opacity={0.5}
                  />
                  {[yTop, yBot].map((cy, i) => (
                    <path
                      key={i}
                      d={
                        i === 0
                          ? `M${cx - 7} ${cy - 6} L${cx} ${cy - 12} L${cx + 7} ${cy - 6}`
                          : `M${cx - 7} ${cy + 6} L${cx} ${cy + 12} L${cx + 7} ${cy + 6}`
                      }
                      fill="none"
                      stroke="var(--muted-foreground)"
                      strokeWidth={2}
                      strokeLinecap="round"
                      opacity={0.6}
                    />
                  ))}
                  <rect
                    x={cx - 26}
                    y={my - 9}
                    width={52}
                    height={18}
                    rx={9}
                    fill="#ff8a3d"
                  />
                  <text
                    x={cx}
                    y={my + 4}
                    textAnchor="middle"
                    fontSize="11"
                    fontWeight="800"
                    fill="white"
                  >
                    안내
                  </text>
                  {/* entrance pill on the right edge of the top hall */}
                  <rect
                    x={top.x + top.w - 6}
                    y={top.y + top.h / 2 - 26}
                    width={14}
                    height={52}
                    rx={4}
                    fill="var(--primary)"
                    opacity={0.85}
                  />
                </g>
              );
            })()}

          {/* booths */}
          {renderBooths.map((b) => {
            // With a floorplan, only render booths that have traced geometry
            // (avoids a stray fallback box overlapping the plan).
            if (floorplan && !(b.code && rectByCode.has(b.code))) return null;
            const cat = catById.get(b.categoryId);
            const isSel = b.id === selectedId;
            const isVisited = visitedSet.has(b.id);
            const isSkipped = !isVisited && skippedSet.has(b.id);
            const order = orderById.get(b.id) ?? -1;
            const g = geomOf(b);
            return (
              <g
                key={b.id}
                transform={`translate(${g.x} ${g.y})`}
                className="cursor-pointer"
                role="button"
                aria-label={`${b.name}${b.code ? ` (${b.code})` : ""}`}
              >
                {(() => {
                  const onRoute = order >= 0;
                  const color = cat?.color ?? "var(--primary)";
                  const zone = g.color ?? `${color}26`;
                  // Map uses STATE colors only — 방문/이따/동선/facility. Category
                  // hue lives in chips/detail, not on the booth (avoids clashing
                  // with the green/amber/indigo status meaning). On-route = indigo.
                  const fill = isVisited
                    ? "var(--route-visited)"
                    : isSkipped
                      ? "var(--warning)"
                      : onRoute
                        ? "var(--primary)"
                        : zone;
                  const darkText =
                    isVisited || isSkipped || onRoute || fill === "#3a3d44";
                  const stroke = isSel
                    ? "var(--primary)"
                    : isSkipped
                      ? "var(--warning)"
                      : g.color && g.color !== "#d8dade"
                        ? g.color
                        : "var(--border)";
                  const codeColor = darkText ? "white" : "#3a3d44";
                  const name =
                    b.name.length > 9 ? `${b.name.slice(0, 9)}…` : b.name;
                  return (
                    <>
                      {/* Draw the box inset by a few px so neighbouring booths
                          keep a visible gap (aisle) between them, like the
                          official map — booth coords pack edge-to-edge. */}
                      <rect
                        x={-g.w / 2 + BOOTH_GAP}
                        y={-g.h / 2 + BOOTH_GAP}
                        width={Math.max(8, g.w - BOOTH_GAP * 2)}
                        height={Math.max(8, g.h - BOOTH_GAP * 2)}
                        rx={5}
                        fill={fill}
                        stroke={stroke}
                        strokeWidth={isSel ? 3.5 : 1.2}
                      />
                      {onRoute && (
                        <>
                          <circle
                            cx={-g.w / 2 + 11}
                            cy={-g.h / 2 + 11}
                            r={9}
                            fill="white"
                          />
                          <text
                            x={-g.w / 2 + 11}
                            y={-g.h / 2 + 15}
                            textAnchor="middle"
                            fontSize="11"
                            fontWeight="800"
                            fill="var(--primary)"
                          >
                            {order + 1}
                          </text>
                        </>
                      )}
                      {Math.min(g.w, g.h) >=
                      (b.kind === "facility" ? 72 : 120) ? (
                        (() => {
                          // Big stands (facility, or a single exhibitor taking a
                          // large booth) show the full name (wrapped, larger)
                          // instead of just a code.
                          const fs = Math.round(
                            clamp(Math.min(g.w, g.h) / 5, 16, 30),
                          );
                          const perLine = Math.max(
                            4,
                            Math.floor((g.w * 0.82) / fs),
                          );
                          const lines = wrapLabel(b.name, perLine, 3);
                          const lh = fs * 1.15;
                          const y0 = -((lines.length - 1) / 2) * lh;
                          return (
                            <text
                              textAnchor="middle"
                              fontSize={fs}
                              fontWeight="800"
                              fill={codeColor}
                              transform={upright(0, 0)}
                            >
                              {lines.map((ln, li) => (
                                <tspan key={li} x={0} y={y0 + li * lh}>
                                  {ln}
                                </tspan>
                              ))}
                            </text>
                          );
                        })()
                      ) : (
                        <text
                          textAnchor="middle"
                          dy="4"
                          fontSize="11"
                          fontWeight="700"
                          fill={codeColor}
                          transform={upright(0, 0)}
                        >
                          {b.code ?? b.name.slice(0, 3)}
                        </text>
                      )}
                      {isSel && (
                        <text
                          textAnchor="middle"
                          y={-g.h / 2 - 6}
                          fontSize="13"
                          fontWeight="700"
                          fill="var(--foreground)"
                          transform={upright(0, -g.h / 2 - 6)}
                        >
                          {name}
                        </text>
                      )}
                    </>
                  );
                })()}
              </g>
            );
          })}

          {/* crowd heat: popular booths tinted on top so the hot spots pop */}
          {heat &&
            renderBooths.map((b) => {
              const c = heat[b.id];
              if (!c) return null;
              if (floorplan && !(b.code && rectByCode.has(b.code))) return null;
              const g = geomOf(b);
              const tier = HEAT_TIERS[heatLevel(c)];
              return (
                <rect
                  key={`bh-${b.id}`}
                  x={g.x - g.w / 2}
                  y={g.y - g.h / 2}
                  width={g.w}
                  height={g.h}
                  rx={6}
                  fill={tier.fill}
                  opacity={tier.opacity}
                  style={{ mixBlendMode: "multiply" }}
                  pointerEvents="none"
                />
              );
            })}

          {/* visitor position */}
          {position && (
            <g transform={`translate(${position.x} ${position.y})`}>
              <circle r="22" fill="var(--primary)" opacity="0.18">
                <animate
                  attributeName="r"
                  values="14;26;14"
                  dur="2s"
                  repeatCount="indefinite"
                />
              </circle>
              <circle
                r="9"
                fill="var(--primary)"
                stroke="white"
                strokeWidth="3"
              />
            </g>
          )}
        </svg>
      </div>

      {/* controls */}
      <div
        className={cn("absolute z-10 flex flex-col gap-2", controlsClassName)}
      >
        <Button
          variant="outline"
          size="icon"
          className="bg-card shadow-[var(--shadow-card)]"
          aria-label="지도 90도 회전"
          onClick={rotate90}
        >
          <RotateCw className="size-5" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="bg-card shadow-[var(--shadow-card)]"
          aria-label="확대"
          onClick={() => zoomBy(1.25, undefined, true)}
        >
          <Plus className="size-5" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="bg-card shadow-[var(--shadow-card)]"
          aria-label="축소"
          onClick={() => zoomBy(0.8, undefined, true)}
        >
          <Minus className="size-5" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="bg-card shadow-[var(--shadow-card)]"
          aria-label="전체 보기"
          onClick={resetView}
        >
          <Locate className="size-5" />
        </Button>
      </div>
    </div>
  );
}
