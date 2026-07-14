import { cn } from "@/lib/utils";
import { valueDef } from "@/lib/values";
import { RoamMotion } from "@/components/companion/roam-motion";

/** 로미 중심 방사형 관람 가치 마인드맵. 노드 크기 = confidence. 마이페이지·온보딩 결과 공용. */
export function ValueMindMap({
  nodes,
  label,
}: {
  nodes: { key: string; confidence: number }[];
  label: (slug: string) => string;
}) {
  const S = 264; // 정사각 영역
  const c = S / 2;
  const R = 92; // 노드 링 반지름
  if (nodes.length === 0) return null;
  return (
    <div className="relative mx-auto mt-4" style={{ width: S, height: S }}>
      {/* 연결선 */}
      <svg
        className="absolute inset-0"
        width={S}
        height={S}
        aria-hidden
        viewBox={`0 0 ${S} ${S}`}
      >
        {nodes.map((n, i) => {
          const a = (-90 + (i * 360) / nodes.length) * (Math.PI / 180);
          return (
            <line
              key={n.key}
              x1={c}
              y1={c}
              x2={c + R * Math.cos(a)}
              y2={c + R * Math.sin(a)}
              stroke="var(--border)"
              strokeWidth={1.5}
            />
          );
        })}
      </svg>

      {/* 중심 = 로미 */}
      <span
        className="absolute flex size-14 items-center justify-center overflow-hidden rounded-full ring-2 ring-primary/30"
        style={{ left: c - 28, top: c - 28 }}
      >
        <RoamMotion src="/walk_think.webm" />
      </span>

      {/* 가치 노드 */}
      {nodes.map((n, i) => {
        const a = (-90 + (i * 360) / nodes.length) * (Math.PI / 180);
        const size = 42 + Math.round(n.confidence * 26); // 42~68
        const x = c + R * Math.cos(a);
        const y = c + R * Math.sin(a);
        const color = valueDef(n.key)?.color ?? "var(--primary)";
        return (
          <div
            key={n.key}
            className="absolute flex flex-col items-center"
            style={{ left: x, top: y, transform: "translate(-50%, -50%)" }}
          >
            <span
              className={cn(
                "flex items-center justify-center rounded-full text-[10px] font-bold text-white shadow-sm",
              )}
              style={{
                width: size,
                height: size,
                backgroundColor: color,
                opacity: 0.55 + n.confidence * 0.45,
              }}
            >
              {label(n.key)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
