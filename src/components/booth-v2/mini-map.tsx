import type { Floorplan } from "@/lib/floorplans";
import { heartCorner } from "@/components/map/booth-label";
import { V2_PX } from "@/styles/v2/lengths.generated";

const C = (name: string) => `var(--roam-v2-color-${name})`;

/**
 * 작은 지도(Figma 3045:18454 홀 벽 + UI/지도/작은 칸). 표시할 칸이 든 홀만 잘라 그린다.
 * - visited: 다녀온 칸은 초록 면(map-booth-visited)과 부스 번호(6-10, 12-06, UI/지도/작은 다녀온 칸 3411:31744,
 *   2026-11-27 Ted UI 26-F4). 하트도 남긴 칸(`heartCodes`)은 오른쪽 위에 짧은 변 0.3 크기 하트(map-heart-mine).
 * - heart: 하트 남긴 칸은 브랜드 옅은 바탕과 테두리, 오른쪽 아래 작은 하트(14-01, 14-05, UI/지도/작은 칸 2992:781).
 *   "이름 없이 칸과 하트만"(Figma 설명).
 */
export function MiniMap({
  floorplan,
  codes,
  mode = "visited",
  heartCodes,
}: {
  floorplan: Floorplan;
  codes: Set<string>;
  mode?: "visited" | "heart";
  /** visited에서 하트도 남긴 칸 번호. 오른쪽 위에 하트를 둔다. */
  heartCodes?: Set<string>;
}) {
  const marked = floorplan.booths.filter((b) => codes.has(b.code));
  if (marked.length === 0) return null;
  const halls = floorplan.halls.filter((h) =>
    marked.some(
      (b) => b.x >= h.x && b.x <= h.x + h.w && b.y >= h.y && b.y <= h.y + h.h,
    ),
  );
  const hall = halls.length
    ? {
        x: Math.min(...halls.map((h) => h.x)),
        y: Math.min(...halls.map((h) => h.y)),
        x1: Math.max(...halls.map((h) => h.x + h.w)),
        y1: Math.max(...halls.map((h) => h.y + h.h)),
      }
    : { x: 0, y: 0, x1: floorplan.width, y1: floorplan.height };
  const cellH = Math.min(...marked.map((b) => Math.min(b.w, b.h)));
  // 표시한 칸 둘레만 잘라 그린다(이웃 칸 몇 줄과 함께). 홀이 커도 칸이 점이 되지 않게. 홀 밖으로는 넘지 않는다.
  const pad = cellH * 4;
  let box = {
    x: Math.min(...marked.map((b) => b.x - b.w / 2)) - pad,
    y: Math.min(...marked.map((b) => b.y - b.h / 2)) - pad,
    x1: Math.max(...marked.map((b) => b.x + b.w / 2)) + pad,
    y1: Math.max(...marked.map((b) => b.y + b.h / 2)) + pad,
  };
  // 카드 폭에 맞게 가로가 세로의 두 배쯤 되도록 넓힌다.
  const want = (box.y1 - box.y) * 2 - (box.x1 - box.x);
  if (want > 0) box = { ...box, x: box.x - want / 2, x1: box.x1 + want / 2 };
  box = {
    x: Math.max(hall.x, box.x),
    y: Math.max(hall.y, box.y),
    x1: Math.min(hall.x1, box.x1),
    y1: Math.min(hall.y1, box.y1),
  };
  const heart = cellH * 0.36;
  return (
    <svg
      aria-hidden
      viewBox={`${box.x} ${box.y} ${box.x1 - box.x} ${box.y1 - box.y}`}
      className="block w-full rounded-v2-r1 border-2 border-v2-stroke-neutral-weak bg-v2-bg-layer-default"
    >
      {floorplan.booths.map((b) => {
        const on = codes.has(b.code);
        const fill = !on
          ? C("map-booth")
          : mode === "heart"
            ? C("bg-brand-weak")
            : C("map-booth-visited");
        const stroke = !on
          ? C("stroke-neutral-weak")
          : mode === "heart"
            ? C("stroke-brand-solid")
            : "none";
        return (
          <g
            key={b.code}
            transform={
              b.rotate ? `rotate(${b.rotate} ${b.x} ${b.y})` : undefined
            }
          >
            <rect
              x={b.x - b.w / 2 + 2}
              y={b.y - b.h / 2 + 2}
              width={Math.max(4, b.w - 4)}
              height={Math.max(4, b.h - 4)}
              rx={V2_PX["radius-r1"]}
              fill={fill}
              stroke={stroke}
              strokeWidth={on && mode === "heart" ? 1.4 : 1}
            />
            {on && mode === "visited" && (
              <text
                x={b.x}
                y={b.y}
                fontSize={cellH * 0.35}
                textAnchor="middle"
                dominantBaseline="central"
                fill={C("map-label-mine")}
                className="font-v2-ui font-v2-regular"
              >
                {b.code}
              </text>
            )}
            {on && mode === "visited" && heartCodes?.has(b.code) && (
              <VisitedHeart b={b} />
            )}
            {on && mode === "heart" && (
              // lucide "heart"(Figma icon/heart Fill). 24 그리드 경로를 칸 오른쪽 아래에 줄여 둔다.
              <path
                transform={`translate(${b.x + b.w / 2 - heart * 1.5} ${b.y + b.h / 2 - heart * 1.5}) scale(${heart / 24})`}
                d={HEART_PATH}
                fill={C("fg-brand")}
              />
            )}
          </g>
        );
      })}
    </svg>
  );
}

const HEART_PATH =
  "M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5";

/** 작은 다녀온 칸 오른쪽 위 하트(3411:31744). 지도 다녀온 칸과 같은 자리 규칙(heartCorner, 짧은 변 0.3). */
function VisitedHeart({ b }: { b: { x: number; y: number; w: number; h: number } }) {
  const w = Math.max(4, b.w - 4);
  const h = Math.max(4, b.h - 4);
  const c = heartCorner(w, h);
  return (
    <path
      data-mark="visited-heart"
      transform={`translate(${b.x + c.x} ${b.y + c.y}) scale(${c.size / 24})`}
      d={HEART_PATH}
      fill={C("map-heart-mine")}
    />
  );
}
