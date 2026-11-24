import { RomiAvatar } from "@/components/v2/romi-avatar";
import { system } from "@/lib/copy/v1";
import type { Floorplan } from "@/lib/floorplans";
import { V2_PX } from "@/styles/v2/lengths.generated";

const C = (name: string) => `var(--roam-v2-color-${name})`;

/**
 * UI 3-03 지도 불러오는 중(Figma 3-03). 뼈대는 **그 박람회의 실제 배치도** 모양이다 —
 * 홀 바닥과 부스 칸 자리를 그대로 그리고 이름만 비운다(11-18 "뼈대는 진짜 내용의 모양").
 * 지도 화면과 같이 위 찾기 줄과 아래 로미 줄 사이 띠에 도면 전체가 들어오게 둔다(넘치지 않게).
 * 배치도가 없는 박람회는 바닥만 깔고 로미 줄만 띄운다(지어낸 칸을 그리지 않는다).
 */
export function MapSkeleton({ floorplan }: { floorplan?: Floorplan }) {
  return (
    <div
      aria-busy
      aria-label={system.mapLoading}
      className="fixed inset-0 z-0 overflow-hidden bg-v2-bg-layer-basement font-v2-ui"
    >
      {floorplan && (
        <div className="absolute inset-x-v2-x4 bottom-v2-x22 top-v2-x28">
          <svg
            aria-hidden
            viewBox={`0 0 ${floorplan.width} ${floorplan.height}`}
            preserveAspectRatio="xMidYMid meet"
            className="h-full w-full motion-safe:animate-pulse"
          >
            {floorplan.halls.map((h) => (
              <rect
                key={`${h.name}-${h.x}`}
                x={h.x}
                y={h.y}
                width={h.w}
                height={h.h}
                rx={V2_PX["radius-r1"]}
                fill={C("map-floor")}
                stroke={C("stroke-neutral-weak")}
                strokeWidth={V2_PX["stroke-width-s3"]}
              />
            ))}
            {floorplan.booths.map((b) => (
              <rect
                key={b.code}
                x={b.x - b.w / 2 + 3}
                y={b.y - b.h / 2 + 3}
                width={Math.max(8, b.w - 6)}
                height={Math.max(8, b.h - 6)}
                rx={V2_PX["radius-r1"]}
                fill={C("map-booth")}
                transform={
                  b.rotate ? `rotate(${b.rotate} ${b.x} ${b.y})` : undefined
                }
              />
            ))}
          </svg>
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 flex justify-center px-v2-x4 pb-safe">
        <p className="mb-v2-x2 flex items-center gap-v2-x2 rounded-v2-pill border border-v2-stroke-neutral-muted bg-v2-bg-layer-floating py-v2-x1 pl-v2-x1 pr-v2-x4 text-v2-t4 font-v2-medium text-v2-fg-neutral shadow-v2-s2">
          <RomiAvatar size="sm" className="shadow-v2-s1" />
          {system.mapLoading}
        </p>
      </div>
    </div>
  );
}
