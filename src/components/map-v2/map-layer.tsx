import { Heart } from "lucide-react";
import type { MapLayerContext } from "@/components/map/exhibition-map";
import { CODE_RATIO, layoutBoothLabel, NAME_LINE_HEIGHT } from "@/components/map/booth-label";
import { V2_PX } from "@/styles/v2/lengths.generated";
import type { BoothListItem } from "@/lib/types";

/**
 * UI 3-01 지도 그림(Figma 3022:3102 홀 바닥, 2994:798 부스 칸, 2994:818 출입구).
 *
 * 엔진(ExhibitionMap)의 이동, 확대, 누르기는 그대로 쓰고 그림만 v2로 바꾼다.
 * - 색은 전부 v2 지도 토큰(map-booth, map-booth-selected, map-booth-facility, map-label,
 *   map-entrance, bg-layer-default, stroke-neutral-weak). SVG라 `var(--roam-v2-color-*)`로 칠한다.
 * - 선 굵기와 둥글기는 v2 토큰의 px 값(V2_PX, tokens.css에서 기계로 뽑은 값)을 도면 단위로 쓴다.
 * - 글자 크기는 칸 크기에 맞춘다(booth-label.ts, iOS BoothLabel과 같은 규칙). 도면 단위가
 *   화면 px이 아니라서 t2(12) 같은 고정 크기를 쓰면 큰 도면에선 점, 작은 도면에선 넘친다.
 * - 하트 칸은 가운데 하트 + 이름(2994:808), 편의시설 칸은 회색 면(2994:813).
 * - 도면 원본 색(존 색)은 쓰지 않는다. v2는 부스 칸 한 색이고 상태만 색으로 가른다.
 */

const C = (name: string) => `var(--roam-v2-color-${name})`;

/** 칸끼리 통로가 보이게 안쪽으로 줄이는 폭(도면 단위). v1 엔진과 같은 값. */
const CELL_GAP = 3;

export function MapLayerV2({
  ctx,
  heartIds,
  highlightIds,
}: {
  ctx: MapLayerContext;
  heartIds: Set<string>;
  /** 편의시설 칩, 검색 결과처럼 지금 눈에 띄워야 하는 칸. 있으면 나머지는 흐리게. */
  highlightIds?: Set<string> | null;
}) {
  const { booths, floorplan, geomOf, hallRegions, upright, selectedId } = ctx;
  const sel = selectedId ? booths.find((b) => b.id === selectedId) : undefined;
  const ordered = sel ? [...booths.filter((b) => b.id !== sel.id), sel] : booths;
  const stroke = V2_PX["stroke-width-s1"];
  const hallStroke = V2_PX["stroke-width-s3"];
  const markerR = V2_PX["radius-r1"];
  // 출입구 알약 글자는 이 도면의 보통 부스 칸 높이에 맞춘다(도면마다 단위가 달라서).
  const cellH = typicalCellHeight(floorplan?.booths);

  return (
    <g>
      {floorplan?.backdrop && (
        <image
          href={floorplan.backdrop.src}
          x={0}
          y={0}
          width={floorplan.width}
          height={floorplan.height}
          opacity={floorplan.backdrop.opacity ?? 1}
          preserveAspectRatio="none"
        />
      )}
      {hallRegions.map((r) => (
        <rect
          key={`hall-${r.label}-${r.x}`}
          x={r.x}
          y={r.y}
          width={r.w}
          height={r.h}
          rx={markerR}
          fill={C("bg-layer-default")}
          stroke={C("stroke-neutral-weak")}
          strokeWidth={hallStroke}
        />
      ))}

      {ordered.map((b) => {
        const g = geomOf(b);
        if (!g) return null;
        const facility = b.kind === "facility";
        const isSel = b.id === selectedId;
        const hearted = !facility && heartIds.has(b.id);
        const dim = highlightIds ? !highlightIds.has(b.id) && !isSel : false;
        const w = Math.max(8, g.w - CELL_GAP * 2);
        const h = Math.max(8, g.h - CELL_GAP * 2);
        const fill = isSel ? C("map-booth-selected") : facility ? C("map-booth-facility") : C("map-booth");
        const text = isSel ? C("map-label-selected") : facility ? C("fg-neutral-muted") : C("map-label");
        return (
          <g
            key={b.id}
            transform={`translate(${g.x} ${g.y})${g.rotate ? ` rotate(${g.rotate})` : ""}`}
            opacity={dim ? 0.35 : 1}
          >
            <rect
              x={-w / 2}
              y={-h / 2}
              width={w}
              height={h}
              rx={markerR}
              fill={fill}
              stroke={isSel ? C("map-booth-selected") : C("stroke-neutral-weak")}
              strokeWidth={stroke}
            />
            <g transform={upright(0, 0) ?? (g.rotate ? `rotate(${-g.rotate})` : undefined)}>
              <CellLabel booth={b} w={w} h={h} color={text} hearted={hearted} selected={isSel} />
            </g>
          </g>
        );
      })}

      {floorplan?.decor.map((d, i) => {
        if (d.type !== "entrance") return null;
        const s = d.size ?? 1;
        const fs = cellH * 0.16 * s;
        const pw = d.text.length * fs * 0.9 + fs * 1.6;
        const ph = fs * 1.7;
        return (
          <g key={`ent-${i}`} transform={upright(d.x, d.y)}>
            <rect
              x={d.x - pw / 2}
              y={d.y - ph / 2}
              width={pw}
              height={ph}
              rx={ph / 2}
              fill={C("map-entrance")}
            />
            <text
              x={d.x}
              y={d.y}
              fontSize={fs}
              textAnchor="middle"
              dominantBaseline="central"
              fill={C("fg-neutral-inverted")}
              className="font-v2-ui font-v2-medium"
            >
              {d.text}
            </text>
          </g>
        );
      })}
    </g>
  );
}

function typicalCellHeight(booths?: { w: number; h: number }[]): number {
  if (!booths?.length) return 80;
  const hs = booths.map((b) => Math.min(b.w, b.h)).sort((a, b) => a - b);
  return hs[Math.floor(hs.length / 2)];
}

function CellLabel({
  booth,
  w,
  h,
  color,
  hearted,
  selected,
}: {
  booth: BoothListItem;
  w: number;
  h: number;
  color: string;
  hearted: boolean;
  selected: boolean;
}) {
  const base = Math.max(7, Math.min(26, Math.min(w, h) / 5.5));
  const center = hearted || booth.kind === "facility";
  const iconSize = hearted ? Math.min(base * 1.4, h * 0.35) : 0;
  const layout = layoutBoothLabel(
    booth.name,
    base,
    w * 0.86,
    h - iconSize - (center ? 0 : base * CODE_RATIO * 1.3),
    !center && !!booth.code,
  );
  const lineH = layout.fontSize * NAME_LINE_HEIGHT;
  const fontClass = hearted || selected ? "font-v2-ui font-v2-bold" : "font-v2-ui font-v2-regular";

  if (center) {
    const blockH = iconSize + (iconSize ? lineH * 0.3 : 0) + lineH * layout.lines.length;
    const top = -blockH / 2;
    return (
      <g>
        {hearted && (
          <Heart
            x={-iconSize / 2}
            y={top}
            width={iconSize}
            height={iconSize}
            fill={selected ? color : C("fg-brand")}
            stroke={selected ? color : C("fg-brand")}
          />
        )}
        <text
          textAnchor="middle"
          fill={hearted && !selected ? C("fg-neutral") : color}
          fontSize={layout.fontSize}
          className={fontClass}
        >
          {layout.lines.map((line, i) => (
            <tspan
              key={i}
              x={0}
              y={top + iconSize + (iconSize ? lineH * 0.3 : 0) + lineH * (i + 0.8)}
            >
              {line}
            </tspan>
          ))}
        </text>
      </g>
    );
  }

  // 왼쪽 위 정렬: 번호 한 줄 + 이름(2994:798의 왼쪽 위 이름표).
  const padX = Math.min(w * 0.08, base * 0.6);
  const padY = Math.min(h * 0.08, base * 0.5);
  const codeSize = base * CODE_RATIO;
  const left = -w / 2 + padX;
  const top = -h / 2 + padY;
  const codeY = top + codeSize;
  const firstY = booth.code ? codeY + lineH * 1.05 : top + lineH;
  return (
    <text fill={color} className={fontClass}>
      {booth.code && (
        <tspan x={left} y={codeY} fontSize={codeSize} opacity={0.7}>
          {booth.code}
        </tspan>
      )}
      {layout.lines.map((line, i) => (
        <tspan key={i} x={left} y={firstY + lineH * i} fontSize={layout.fontSize}>
          {line}
        </tspan>
      ))}
    </text>
  );
}
