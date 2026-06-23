"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";
import { Minus, Plus, Locate } from "lucide-react";
import { cn, clamp } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { Booth, Category, Hall, Point } from "@/lib/types";
import type { Floorplan } from "@/lib/floorplans";
import { aisleRoute } from "@/lib/aisle-route";

// Fallback booth box when no floorplan geometry is supplied.
const BOOTH_W = 72;
const BOOTH_H = 62;

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
  className?: string;
  /** Insets the interactive/measured viewport (e.g. to clear an overlapping
   *  bottom sheet) so fit + clamp use the visible area, not the full container.
   *  Tailwind positioning classes; defaults to filling the container. */
  viewportClassName?: string;
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
  className,
  viewportClassName = "inset-0",
}: MapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
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

  // Write the current view to the DOM. `animate` adds a short transition for
  // programmatic moves (tap-zoom, buttons); drags pass false for instant feel.
  const applyView = useCallback((animate = false) => {
    const el = svgRef.current;
    if (!el) return;
    const { scale, offset } = view.current;
    el.style.transition = animate ? "transform 220ms ease-out" : "none";
    el.style.transform = `translate(${offset.x}px, ${offset.y}px) scale(${scale})`;
  }, []);
  // Re-assert just the transform after a React re-render (which would otherwise
  // drop the imperatively-set inline style). Leaves `transition` untouched so an
  // in-flight animated move (tap-zoom, centre-on) isn't cut short.
  const reassertTransform = useCallback(() => {
    const el = svgRef.current;
    if (!el) return;
    const { scale, offset } = view.current;
    el.style.transform = `translate(${offset.x}px, ${offset.y}px) scale(${scale})`;
  }, []);
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

  // Effective canvas size: floorplan dims override the props when present.
  const width = floorplan?.width ?? widthProp;
  const height = floorplan?.height ?? heightProp;

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
      if (userAdjusted.current) {
        const s = view.current.scale;
        const o = view.current.offset;
        view.current.offset = {
          x: clamp(
            o.x,
            Math.min(0, cw - width * s),
            Math.max(0, cw - width * s),
          ),
          y: clamp(
            o.y,
            Math.min(0, ch - height * s),
            Math.max(0, ch - height * s),
          ),
        };
        applyView(animate);
        return;
      }
      const contain = Math.min(cw / width, ch / height) * 0.96;
      // fillHeight: zoom so the map fills the viewport vertically (pan horizontally),
      // but never below the contain scale.
      const s = fillHeight ? Math.max(contain, (ch / height) * 0.92) : contain;
      const cx = focus ? focus.x : width / 2;
      const cy = focus ? focus.y : height / 2;
      const scaledH = height * s;
      view.current = {
        scale: s,
        offset: {
          x: clamp(
            cw / 2 - cx * s,
            Math.min(0, cw - width * s),
            Math.max(0, cw - width * s),
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
    [width, height, fillHeight, focus?.x, focus?.y, applyView],
  );

  // The explicit "전체 보기" control: drop the user-adjusted lock and re-fit.
  const resetView = useCallback(() => {
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
      return {
        x: clamp(
          off.x,
          Math.min(0, cw - width * s),
          Math.max(0, cw - width * s),
        ),
        y: clamp(
          off.y,
          Math.min(0, ch - height * s),
          Math.max(0, ch - height * s),
        ),
      };
    },
    [width, height],
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
        zoomBy(scale > 3 ? 0.5 : 1.9, p, true);
        lastTap.current = { t: 0, x: 0, y: 0 };
      } else {
        lastTap.current = { t: now, x: p.x, y: p.y };
        const mx = (p.x - offset.x) / scale;
        const my = (p.y - offset.y) / scale;
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
          // Tapping a booth nudges the view toward it — a gentle zoom-in (only
          // if currently zoomed out) and re-centre, then preserve that view.
          if (hitBooth) {
            const el = containerRef.current;
            if (el) {
              const g = geomOf(hitBooth);
              const next = Math.max(view.current.scale, 1.4);
              view.current = {
                scale: next,
                offset: clampOffset(
                  {
                    x: el.clientWidth / 2 - g.x * next,
                    y: el.clientHeight / 2 - g.y * next,
                  },
                  next,
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
    if (e.deltaY !== 0) zoomBy(e.deltaY < 0 ? 1.12 : 0.89, localPoint(e));
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
    const ch = el.clientHeight;
    const next = Math.max(view.current.scale, 1.4);
    view.current = {
      scale: next,
      offset: clampOffset(
        { x: cw / 2 - g.x * next, y: ch / 2 - g.y * next },
        next,
      ),
    };
    userAdjusted.current = true;
    applyView(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [centerOn]);

  const routeKey = routeOrder?.join(",");
  const routePathD = useMemo(
    () => {
      const waypoints: Pt[] = floorplan
        ? aisleRoute(
            orderedRouteCenters,
            floorplan.booths.map((b) => ({ x: b.x, y: b.y, w: b.w, h: b.h })),
            width,
            height,
          )
        : orthWaypoints(orderedRouteCenters);
      return roundedPathD(waypoints, 10);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [routeKey, floorplan, width, height],
  );

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
          style={{ transformOrigin: "0 0" }}
          className="select-none"
        >
          {/* grid backdrop */}
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

          {/* hall containers + labels */}
          {hallRegions.map((r) => (
            <g key={r.label}>
              <rect
                x={r.x}
                y={r.y}
                width={r.w}
                height={r.h}
                fill="var(--secondary)"
                opacity={0.35}
                stroke="var(--border)"
                strokeWidth={1.5}
                rx="14"
              />
              <text
                x={r.x + 16}
                y={r.y + 22}
                fontSize="16"
                fontWeight="800"
                fill="var(--muted-foreground)"
              >
                {r.label}
              </text>
            </g>
          ))}

          {/* route path — drawn under decor/booths so block headers, entrance
              and exit labels stay readable on top of the walking line. */}
          {routePathD && (
            <>
              <path
                d={routePathD}
                fill="none"
                stroke="white"
                strokeWidth={10}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={0.9}
              />
              <path
                d={routePathD}
                fill="none"
                stroke="var(--route-line)"
                strokeWidth={6}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </>
          )}

          {/* floorplan decor (passage arrows, info bars, entrance, labels) */}
          {floorplan?.decor.map((d, i) => {
            if (d.type === "header") {
              return (
                <g key={i}>
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
                <g key={i}>
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
              return (
                <g key={i}>
                  <rect
                    x={d.x - 30}
                    y={d.y - 30}
                    width={60}
                    height={60}
                    rx={10}
                    fill="var(--primary)"
                  />
                  <text
                    x={d.x}
                    y={d.y + 10}
                    textAnchor="middle"
                    fontSize={26}
                    fontWeight="800"
                    fill="white"
                  >
                    WC
                  </text>
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
              const arrow =
                d.dir === "left"
                  ? `M${d.x + 86} ${d.y - aw} L${d.x + 86 + aw} ${d.y} L${d.x + 86} ${d.y + aw}`
                  : d.dir === "right"
                    ? `M${d.x - 86} ${d.y - aw} L${d.x - 86 - aw} ${d.y} L${d.x - 86} ${d.y + aw}`
                    : d.dir === "up"
                      ? `M${d.x - aw} ${d.y + 44} L${d.x} ${d.y + 44 - aw} L${d.x + aw} ${d.y + 44}`
                      : `M${d.x - aw} ${d.y - 44} L${d.x} ${d.y - 44 + aw} L${d.x + aw} ${d.y - 44}`;
              return (
                <g key={i}>
                  <rect
                    x={d.x - 80}
                    y={d.y - 30}
                    width={160}
                    height={60}
                    rx={30}
                    fill="var(--primary)"
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
                  <path
                    d={arrow}
                    fill="none"
                    stroke="var(--primary)"
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
                      <rect
                        x={-g.w / 2}
                        y={-g.h / 2}
                        width={g.w}
                        height={g.h}
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
                      <text
                        textAnchor="middle"
                        dy="4"
                        fontSize="11"
                        fontWeight="700"
                        fill={codeColor}
                      >
                        {b.code ?? b.name.slice(0, 3)}
                      </text>
                      {isSel && (
                        <text
                          textAnchor="middle"
                          y={-g.h / 2 - 6}
                          fontSize="13"
                          fontWeight="700"
                          fill="var(--foreground)"
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
      <div className="absolute bottom-4 right-3 flex flex-col gap-2">
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
