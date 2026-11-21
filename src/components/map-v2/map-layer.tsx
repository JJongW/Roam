import { memo } from "react";
import { Bath, Check, Heart } from "lucide-react";
import type { MapLayerContext, MapRect } from "@/components/map/exhibition-map";
import { labelFadeStyle, labelLevel } from "@/components/map/map-camera";
import {
  CODE_RATIO,
  layoutBoothLabel,
  NAME_LINE_HEIGHT,
} from "@/components/map/booth-label";
import { V2_NUM, V2_PX } from "@/styles/v2/lengths.generated";
import { entranceMarkers, wcMarkers } from "./map-markers";
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
 * - 다녀온 칸(UI/지도/다녀온 칸 3002:4574)은 보통 칸 이름표 + 오른쪽 아래 체크. 하트보다 앞선다(6-02,
 *   섹션 8 "경험한 판정이 먼저").
 * - 도면 원본 색(존 색)은 쓰지 않는다. v2는 부스 칸 한 색이고 상태만 색으로 가른다.
 * - 칸 이름과 번호는 화면에서 t1(가장 작은 글자 눈금)보다 작아지는 배율에서 숨는다. 엔진이 적는
 *   라벨 단계를 보고 opacity로 잇는다(map-level 토큰). 하트와 다녀온 체크는 늘 보인다.
 * - 칸 하나하나는 memo다. 선택이나 하트가 바뀌면 그 칸만 다시 그린다.
 */

/** 이보다 작게 보이는 글자는 숨긴다(화면 px) — v2 글자 눈금의 가장 작은 값 t1. */
const LABEL_MIN_PX = V2_PX["font-size-t1"];

const C = (name: string) => `var(--roam-v2-color-${name})`;

/** 칸끼리 통로가 보이게 안쪽으로 줄이는 폭(도면 단위). v1 엔진과 같은 값. */
const CELL_GAP = 3;

/** UI 9 길 안내 선. 한 번 그린 선이고 따라 움직이지 않는다(11-11, 추적 없음). */
export interface RouteOverlay {
  path: { x: number; y: number }[];
  /** 출발 자리 이름표("'꽃잠' 앞", "출입구"). */
  startLabel?: string;
  /** 가는 곳. 칸 둘레를 길 색으로 두른다. */
  targetId?: string;
}

export const MapLayerV2 = memo(function MapLayerV2({
  ctx,
  heartIds,
  visitedIds,
  highlightIds,
  route,
}: {
  ctx: MapLayerContext;
  heartIds: Set<string>;
  visitedIds?: Set<string>;
  /** 편의시설 칩, 검색 결과처럼 지금 눈에 띄워야 하는 칸. 있으면 나머지는 흐리게. */
  highlightIds?: Set<string> | null;
  route?: RouteOverlay | null;
}) {
  const {
    booths,
    floorplan,
    geomOf,
    hallRegions,
    upright,
    selectedId,
    fitScale,
  } = ctx;
  const sel = selectedId ? booths.find((b) => b.id === selectedId) : undefined;
  const ordered = sel
    ? [...booths.filter((b) => b.id !== sel.id), sel]
    : booths;
  const stroke = V2_PX["stroke-width-s1"];
  const hallStroke = V2_PX["stroke-width-s3"];
  const markerR = V2_PX["radius-r1"];

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
        const visited = !facility && !!visitedIds?.has(b.id);
        return (
          <BoothCell
            key={b.id}
            booth={b}
            g={g}
            selected={isSel}
            visited={visited}
            hearted={!facility && !visited && heartIds.has(b.id)}
            dim={highlightIds ? !highlightIds.has(b.id) && !isSel : false}
            upright={upright(0, 0)}
          />
        );
      })}

      {route && <RouteLine route={route} ctx={ctx} />}

      {/* 길잡이 표식: 벽 바깥에 붙여 부스 칸을 덮지 않는다(map-markers.ts). 화장실 칩을 켜면 진하게 남는다. */}
      {floorplan &&
        wcMarkers(floorplan, fitScale).map((m, i) => (
          <g key={`wc-${i}`} transform={upright(m.x + m.w / 2, m.y + m.h / 2)}>
            <rect
              x={m.x}
              y={m.y}
              width={m.w}
              height={m.h}
              rx={m.h / 2}
              fill={C("bg-layer-floating")}
              stroke={C("stroke-neutral-muted")}
              strokeWidth={stroke}
            />
            <Bath
              aria-hidden
              x={m.x + (m.w - m.icon) / 2}
              y={m.y + (m.h - m.icon) / 2}
              width={m.icon}
              height={m.icon}
              stroke={C("fg-neutral")}
            />
          </g>
        ))}
      {floorplan &&
        entranceMarkers(floorplan, fitScale).map((m, i) => (
          <g key={`ent-${i}`} transform={upright(m.x + m.w / 2, m.y + m.h / 2)}>
            <rect
              x={m.x}
              y={m.y}
              width={m.w}
              height={m.h}
              rx={m.h / 2}
              fill={C("map-entrance")}
            />
            <text
              x={m.x + m.w / 2}
              y={m.y + m.h / 2}
              fontSize={m.fontSize}
              textAnchor="middle"
              dominantBaseline="central"
              fill={C("fg-neutral-inverted")}
              className="font-v2-ui font-v2-medium"
            >
              {m.text}
            </text>
          </g>
        ))}
    </g>
  );
});

/** 부스 칸 하나. 입력이 같으면 다시 그리지 않는다(이름 줄바꿈 계산 포함). */
const BoothCell = memo(function BoothCell({
  booth: b,
  g,
  selected: isSel,
  visited,
  hearted,
  dim,
  upright,
}: {
  booth: BoothListItem;
  g: MapRect;
  selected: boolean;
  visited: boolean;
  hearted: boolean;
  dim: boolean;
  upright: string | undefined;
}) {
  const facility = b.kind === "facility";
  const stroke = V2_PX["stroke-width-s1"];
  const markerR = V2_PX["radius-r1"];
  const w = Math.max(8, g.w - CELL_GAP * 2);
  const h = Math.max(8, g.h - CELL_GAP * 2);
  const fill = isSel
    ? C("map-booth-selected")
    : facility
      ? C("map-booth-facility")
      : C("map-booth");
  const text = isSel
    ? C("map-label-selected")
    : facility
      ? C("fg-neutral-muted")
      : C("map-label");
  return (
    <g
      transform={`translate(${g.x} ${g.y})${g.rotate ? ` rotate(${g.rotate})` : ""}`}
      opacity={dim ? V2_NUM["opacity-map-dim"] : 1}
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
      <g transform={upright ?? (g.rotate ? `rotate(${-g.rotate})` : undefined)}>
        <CellLabel
          booth={b}
          w={w}
          h={h}
          color={text}
          hearted={hearted}
          selected={isSel}
        />
        {visited && (
          <VisitedCheck
            w={w}
            h={h}
            color={isSel ? C("map-label-selected") : C("fg-neutral-muted")}
          />
        )}
      </g>
    </g>
  );
});

/**
 * 길 안내 선(지도 토큰 map-route). 굵기와 이름표는 맞춘 배율에서 화면 px로 읽히는 크기다(출입구 표식과
 * 같은 규칙). 도착 칸은 둘레만 두르고 칸 색은 그대로 둔다(하트, 다녀온 표시를 가리지 않는다).
 */
function RouteLine({ route, ctx }: { route: RouteOverlay; ctx: MapLayerContext }) {
  const k = ctx.fitScale && ctx.fitScale > 0 ? 1 / ctx.fitScale : 1;
  const width = 4 * k;
  const target = route.targetId
    ? ctx.booths.find((b) => b.id === route.targetId)
    : undefined;
  const tg = target ? ctx.geomOf(target) : null;
  const d = route.path
    .map((p, i) => `${i ? "L" : "M"}${p.x} ${p.y}`)
    .join(" ");
  const start = route.path[0];
  const font = V2_PX["font-size-t2"] * k;
  const labelW = route.startLabel ? font * (route.startLabel.length * 0.95 + 1.6) : 0;
  return (
    <g pointerEvents="none">
      {tg && (
        <rect
          x={tg.x - tg.w / 2 - width}
          y={tg.y - tg.h / 2 - width}
          width={tg.w + width * 2}
          height={tg.h + width * 2}
          rx={V2_PX["radius-r1"] + width}
          fill="none"
          stroke={C("map-route")}
          strokeWidth={width * 0.75}
          transform={tg.rotate ? `rotate(${tg.rotate} ${tg.x} ${tg.y})` : undefined}
        />
      )}
      {route.path.length >= 2 && (
        <>
          <path
            d={d}
            fill="none"
            stroke={C("bg-layer-floating")}
            strokeWidth={width * 2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d={d}
            fill="none"
            stroke={C("map-route")}
            strokeWidth={width}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle
            cx={start.x}
            cy={start.y}
            r={width * 1.6}
            fill={C("map-route")}
            stroke={C("bg-layer-floating")}
            strokeWidth={width * 0.6}
          />
          {route.startLabel && (
            <g transform={ctx.upright(start.x, start.y)}>
              <rect
                x={start.x - labelW / 2}
                y={start.y - width * 2 - font * 1.9}
                width={labelW}
                height={font * 1.7}
                rx={font * 0.85}
                fill={C("map-route")}
              />
              <text
                x={start.x}
                y={start.y - width * 2 - font * 1.05}
                fontSize={font}
                textAnchor="middle"
                dominantBaseline="central"
                fill={C("fg-on-brand-solid")}
                className="font-v2-ui font-v2-bold"
              >
                {route.startLabel}
              </text>
            </g>
          )}
        </>
      )}
    </g>
  );
}

/** 다녀온 칸 오른쪽 아래 체크. 하트 칸 하트와 같은 크기 규칙(칸 크기에 맞춘다). */
function VisitedCheck({
  w,
  h,
  color,
}: {
  w: number;
  h: number;
  color: string;
}) {
  const base = Math.max(7, Math.min(26, Math.min(w, h) / 5.5));
  const size = Math.min(base * 1.4, h * 0.35);
  const pad = Math.min(w * 0.08, base * 0.6);
  return (
    <Check
      x={w / 2 - pad - size}
      y={h / 2 - pad - size}
      width={size}
      height={size}
      stroke={color}
    />
  );
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
  const fontClass =
    hearted || selected
      ? "font-v2-ui font-v2-bold"
      : "font-v2-ui font-v2-regular";

  if (center) {
    const blockH =
      iconSize + (iconSize ? lineH * 0.3 : 0) + lineH * layout.lines.length;
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
          style={labelFadeStyle(labelLevel(layout.fontSize, LABEL_MIN_PX))}
        >
          {layout.lines.map((line, i) => (
            <tspan
              key={i}
              x={0}
              y={
                top +
                iconSize +
                (iconSize ? lineH * 0.3 : 0) +
                lineH * (i + 0.8)
              }
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
  // 번호 줄과 이름 줄은 숨는 배율이 달라(번호가 더 작다) text를 나눈다. tspan엔 opacity가 걸리지 않는다.
  return (
    <>
      {booth.code && (
        <text
          x={left}
          y={codeY}
          fontSize={codeSize}
          fill={color}
          className={fontClass}
          style={labelFadeStyle(
            labelLevel(codeSize, LABEL_MIN_PX),
            V2_NUM["opacity-map-code"],
          )}
        >
          {booth.code}
        </text>
      )}
      <text
        fill={color}
        className={fontClass}
        style={labelFadeStyle(labelLevel(layout.fontSize, LABEL_MIN_PX))}
      >
        {layout.lines.map((line, i) => (
          <tspan
            key={i}
            x={left}
            y={firstY + lineH * i}
            fontSize={layout.fontSize}
          >
            {line}
          </tspan>
        ))}
      </text>
    </>
  );
}
