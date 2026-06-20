"use client";

export interface HeatPoint {
  x: number;
  y: number;
  weight: number;
}

export function Heatmap({
  width,
  height,
  points,
}: {
  width: number;
  height: number;
  points: HeatPoint[];
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-secondary/30">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label="방문 밀집도 히트맵">
        <defs>
          <radialGradient id="heat" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#f04452" stopOpacity="0.85" />
            <stop offset="45%" stopColor="#ffb020" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#4f46e5" stopOpacity="0" />
          </radialGradient>
          <pattern id="hgrid" width="50" height="50" patternUnits="userSpaceOnUse">
            <path d="M50 0H0V50" fill="none" stroke="var(--border)" strokeWidth="1" opacity="0.4" />
          </pattern>
        </defs>
        <rect width={width} height={height} fill="url(#hgrid)" />
        {points.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={40 + p.weight * 70}
            fill="url(#heat)"
            style={{ mixBlendMode: "multiply" }}
          />
        ))}
      </svg>
    </div>
  );
}
