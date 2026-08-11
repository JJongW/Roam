import { CONFIDENT_THRESHOLD } from "@/lib/constants";
import { radarPoints, ringPolygon } from "@/lib/values/radar";

/**
 * 취향 레이더 — 8가치 고정축.
 *
 * 예전엔 관심을 원 크기로 그렸는데(ValueMindMap), 원 두 개의 넓이 차이는 사람이
 * 못 읽고 값이 없는 가치는 아예 안 그려져 "어디로 치우쳤나"가 보이지 않았다.
 * 축을 고정하고 빈 축을 남기면 치우침이 모양 하나로 읽힌다.
 *
 * 점선 링 = 확신 임계(CONFIDENT_THRESHOLD, constants.ts). taste.ts·curate.ts·
 * reaction-line.ts가 쓰는 바로 그 상수다 — 이 화면이 그 선을 눈에 보이게 그리므로
 * 따로 적어두면 "그려진 선"과 "추천이 자르는 선"이 갈릴 수 있다. 이 선 안쪽은
 * "아직 모르는 것", 바깥은 "확실한 것".
 */

const R = 100;
/** 라벨이 잘리지 않게 반지름보다 넉넉히 잡는다. */
const VB = 300;
const C = VB / 2;

export function TasteRadar({
  values,
  label,
}: {
  values: Record<string, number>;
  label: (slug: string) => string;
}) {
  const points = radarPoints(values, R);
  return (
    <svg
      viewBox={`0 0 ${VB} ${VB}`}
      className="mx-auto mt-2 block w-full max-w-[300px]"
      role="img"
      aria-label="내 취향 분포"
    >
      <defs>
        <linearGradient id="taste-radar-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.45" />
          <stop offset="100%" stopColor="var(--primary)" stopOpacity="0.12" />
        </linearGradient>
      </defs>

      <g transform={`translate(${C} ${C})`}>
        {/* 눈금 링 25·50·75·100% — 여기 0.25는 눈금 간격이지 확신 임계가 아니다
            (그건 아래 점선 하나뿐). 값이 같아 보여도 같은 개념이 아니라 상수로 안 묶는다. */}
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <polygon
            key={f}
            points={ringPolygon(f, R)}
            fill="none"
            stroke="var(--border)"
            strokeWidth={1}
          />
        ))}

        {/* 축선은 값과 무관하게 항상 바깥 링까지 뻗는다 — 그래야 빈 축도 자리가 보인다. */}
        {ringPolygon(1, R)
          .split(" ")
          .map((pair) => {
            const [x, y] = pair.split(",").map(Number);
            return (
              <line
                key={`axis-${pair}`}
                x1={0}
                y1={0}
                x2={x}
                y2={y}
                stroke="var(--border)"
                strokeWidth={1}
              />
            );
          })}

        {/* 확신 임계선 — 이 안쪽은 아직 모르는 것. */}
        <polygon
          points={ringPolygon(CONFIDENT_THRESHOLD, R)}
          fill="none"
          stroke="var(--primary)"
          strokeWidth={1.2}
          strokeDasharray="3 4"
          opacity={0.55}
        />

        <polygon
          points={points
            .map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`)
            .join(" ")}
          fill="url(#taste-radar-fill)"
          stroke="var(--primary)"
          strokeWidth={2.5}
          strokeLinejoin="round"
        />

        {points.map((p) => (
          <circle
            key={`dot-${p.slug}`}
            cx={p.x}
            cy={p.y}
            r={4.5}
            fill="var(--card)"
            stroke="var(--primary)"
            strokeWidth={2.5}
          />
        ))}

        {points.map((p) => (
          <text
            key={`label-${p.slug}`}
            x={p.labelX}
            y={p.labelY + 4}
            textAnchor={p.anchor}
            data-strong={p.frac >= CONFIDENT_THRESHOLD ? "true" : "false"}
            className={
              p.frac >= CONFIDENT_THRESHOLD
                ? "fill-foreground text-[12px] font-bold"
                : "fill-muted-foreground text-[12px] font-semibold opacity-60"
            }
          >
            {label(p.slug)}
          </text>
        ))}
      </g>
    </svg>
  );
}
