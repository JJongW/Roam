import { distance } from "@/lib/engine/scoring";
import type { Booth, Point } from "@/lib/types";

/** Map coordinate units per real-world meter (venue ~100m wide over 1000 units). */
export const MAP_UNITS_PER_METER = 10;

export type Direction = "straight" | "left" | "right" | "back" | "arrive";

export interface NavInstruction {
  direction: Direction;
  /** Human label (Korean). */
  text: string;
  meters: number;
  bearing: number; // degrees, 0 = up(north), clockwise
}

/** Bearing from a→b in degrees (0 = up, clockwise). */
export function bearing(a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const deg = (Math.atan2(dx, -dy) * 180) / Math.PI; // -dy: screen y grows downward
  return (deg + 360) % 360;
}

/** Relative turn given the heading the user is currently facing. */
function relativeTurn(heading: number, target: number): Direction {
  const diff = ((target - heading + 540) % 360) - 180; // -180..180
  if (Math.abs(diff) <= 25) return "straight";
  if (Math.abs(diff) >= 155) return "back";
  return diff > 0 ? "right" : "left";
}

const LABEL: Record<Direction, string> = {
  straight: "직진",
  left: "왼쪽",
  right: "오른쪽",
  back: "뒤돌아",
  arrive: "도착",
};

/**
 * Turn-by-turn instruction from current position to the next booth.
 * `heading` is the direction the user currently faces (default: toward target = straight).
 */
export function nextInstruction(
  from: Point,
  to: Booth,
  arriveThresholdUnits = 60,
  heading?: number,
): NavInstruction {
  const dist = distance(from, to);
  const meters = Math.max(0, Math.round((dist / MAP_UNITS_PER_METER) * 10) / 10);
  const brg = bearing(from, to);

  if (dist <= arriveThresholdUnits) {
    return { direction: "arrive", text: `${to.name} 도착`, meters, bearing: brg };
  }
  const dir = heading == null ? "straight" : relativeTurn(heading, brg);
  const prefix = dir === "straight" ? "직진" : `${LABEL[dir]}으로`;
  return { direction: dir, text: `${prefix} 약 ${meters}m · ${to.name}`, meters, bearing: brg };
}

/** True when the visitor has strayed too far from the path to the next booth. */
export function offRoute(position: Point, next: Booth | undefined, thresholdUnits = 250): boolean {
  if (!next) return false;
  return distance(position, next) > thresholdUnits;
}
