import { memo, useMemo } from "react";
import { Bath, Heart } from "lucide-react";
import type { MapLayerContext, MapRect } from "@/components/map/exhibition-map";
import {
  LABEL_LEVELS_PER_OCTAVE,
  labelFadeStyle,
  labelLevel,
  uprightAnchor,
  zoomLevel,
} from "@/components/map/map-camera";
import {
  CODE_RATIO,
  heartCorner,
  labelBaseUnits,
  labelInner,
  layoutBoothLabel,
  NAME_LINE_HEIGHT,
  NAME_WIDTH,
} from "@/components/map/booth-label";
import {
  facilityBeside,
  layoutFacilityInside,
  type CenterRect,
  type FacilityBeside,
} from "@/components/map/facility-label";
import { V2_NUM, V2_PX } from "@/styles/v2/lengths.generated";
import { entranceMarkers, wcMarkers } from "./map-markers";
import { heartCellLayout } from "./heart-cell";
import { HeartLabel } from "./heart-label";
import type { BoothListItem } from "@/lib/types";

/**
 * UI 3-01 지도 그림(Figma 3022:3102 홀 바닥, 2994:798 부스 칸, 2994:818 출입구).
 *
 * 엔진(ExhibitionMap)의 이동, 확대, 누르기는 그대로 쓰고 그림만 v2로 바꾼다.
 * - 색은 전부 v2 지도 토큰(map-floor, map-booth, map-booth-selected, map-booth-facility, map-label,
 *   map-entrance, stroke-neutral-weak). SVG라 `var(--roam-v2-color-*)`로 칠한다.
 * - 내 칸(UI 22 A + 내 부스 강조, 2026-11-24 Ted): 하트를 남긴 칸은 map-booth-mine으로 칠하고
 *   그 위 이름, 하트는 map-label-mine, map-heart-mine. 고른 칸과 편의시설 칸은 그대로.
 *   라이트 값은 보통 칸과 거의 같고 다크에서만 갈린다(Roam-design docs/decisions/2026-11-24_다크-지도-내-부스-강조.md).
 * - 다녀온 칸(UI 26-F4, 2026-11-27 Ted): 칸을 map-booth-visited 초록 면으로 칠한다. 체크 아이콘과 테두리는 쓰지 않고
 *   칸 위에 아이콘을 올리지 않는다. 하트도 남겼으면 하트를 숨기지 않고 하트 칸 자리에 map-heart-mine으로, 이름은
 *   map-label-mine으로 그린다(UI/지도/다녀온 칸 3002:4574). 이름표는 보통 칸처럼 왼쪽 위, 하트는 칸 크기와 상관없이 오른쪽 위에
 *   짧은 변 × ratio.map-booth-heart-corner(0.3) 크기로 둔다(`heartCorner`). 고른 칸은 map-booth-selected가 앞서고 하트는 흰색
 *   (map-label-selected)이다. 다녀온 사실은 카드 알약이 보여 준다.
 *   끝난 박람회(F-B)에서도 같은 초록이다(Roam-design docs/decisions/2026-11-27_지도-다녀온-칸-초록-면-발자국.md).
 * - 선 굵기와 둥글기는 v2 토큰의 px 값(V2_PX, tokens.css에서 기계로 뽑은 값)을 도면 단위로 쓴다.
 * - 글자 크기는 칸 크기에 맞춘다(booth-label.ts, iOS BoothLabel과 같은 규칙). 도면 단위가
 *   화면 px이 아니라서 t2(12) 같은 고정 크기를 쓰면 큰 도면에선 점, 작은 도면에선 넘친다.
 * - 하트 칸(UI 21 Q2 A, 2026-11-22): 칸이 화면에서 34×20 미만이면 하트를 칸 오른쪽 위에 작게 두고 이름은
 *   가운데, 그 이상이면 UI 부품 "상태=하트"처럼 하트(16)를 이름 왼쪽에(heart-cell.ts, heart-label.tsx).
 *   편의시설 칸은 회색 면(2994:813).
 * - 시설 칸 이름(iOS `FacilityLabel`, 2026-11-25): 어절 단위로만 줄을 바꾸고 글자를 줄이거나 "…"을 붙이지 않는다.
 *   칸 안에 안 들어가면 칸 바로 옆 빈 바닥에 쓰고(SDF 2026 A-05 무대 막대), 그래도 안 되면 그리지 않는다(facility-label.ts).
 * - 도면 원본 색(존 색)은 쓰지 않는다. v2는 부스 칸 한 색이고 상태만 색으로 가른다.
 * - 칸 번호는 화면에서 t1(가장 작은 글자 눈금)보다 작아지는 배율에서 숨는다. 엔진이 적는
 *   라벨 단계를 보고 opacity로 잇는다(map-level 토큰). 이름은 어떤 배율에서도 숨기지 않는다
 *   (2026-10-15 결정, 11-21 Ted 다시 확인). 하트도 늘 보인다.
 * - 칸 하나하나는 memo다. 선택이나 하트가 바뀌면 그 칸만 다시 그린다.
 * - 지도를 돌려도(2026-11-23) 이름, 번호, 하트, 출입구와 화장실 표식, 길 안내 이름표는 바로 선다. 이 층은
 *   축만 달아 두고(`uprightAnchor`) 엔진이 각도가 바뀔 때 그 요소에만 transform을 적어서, 돌리는 동안 다시 그리지 않는다.
 *   멈춘 각도가 90도 쪽이면(`labelQuarter` 홀수) 칸이 화면에서 세로와 가로가 바뀌므로 이름표를 바꾼 가로세로로 나눈다.
 */

/** 번호 줄이 이보다 작게 보이면 숨긴다(화면 px) — v2 글자 눈금의 가장 작은 값 t1. */
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
    labelQuarter,
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
  // 하트 칸 큰 모양을 재기 시작하는 단계(맞춤 배율의 한 옥타브 아래)와, 엔진이 단계를 적기 전에 쓸 단계.
  const fitLevel = fitScale && fitScale > 0 ? zoomLevel(fitScale) : 0;

  // 칸 안에 이름이 안 들어가는 시설 칸은 칸 옆 빈 바닥에 쓴다. 덮으면 안 되는 칸은 도면의 모든 칸이다.
  const besides = useMemo(() => {
    const out: { booth: BoothListItem; beside: FacilityBeside }[] = [];
    const facilities = booths.filter((b) => b.kind === "facility");
    if (facilities.length === 0) return out;
    const avoid: CenterRect[] = floorplan
      ? floorplan.booths
      : booths.map((b) => geomOf(b)).filter((g): g is MapRect => !!g);
    for (const b of facilities) {
      const g = geomOf(b);
      if (!g) continue;
      const swap = (labelQuarter + Math.round((g.rotate ?? 0) / 90)) % 2 !== 0;
      if (layoutFacilityInside(b.name, swap ? g.h : g.w, swap ? g.w : g.h)) continue;
      const beside = facilityBeside(b.name, g, avoid, hallRegions);
      if (beside) out.push({ booth: b, beside });
    }
    return out;
  }, [booths, floorplan, geomOf, hallRegions, labelQuarter]);

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
          fill={C("map-floor")}
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
        const hearted = !facility && heartIds.has(b.id);
        return (
          <BoothCell
            key={b.id}
            booth={b}
            g={g}
            selected={isSel}
            visited={visited}
            hearted={hearted}
            dim={highlightIds ? !highlightIds.has(b.id) && !isSel : false}
            // 칸 자체 각도까지 더해 가장 가까운 사분면이 홀수면 이름표의 가로세로를 바꾼다. 바뀐 칸만 다시 그린다.
            swap={(labelQuarter + Math.round((g.rotate ?? 0) / 90)) % 2 !== 0}
            // 하트 칸만 받는다. 맞춤 배율이 바뀌어도 나머지 칸은 다시 그리지 않는다.
            fitLevel={hearted && !visited ? fitLevel : undefined}
          />
        );
      })}

      {besides.map(({ booth: b, beside }) => {
        const isSel = b.id === selectedId;
        const dim = highlightIds ? !highlightIds.has(b.id) && !isSel : false;
        return (
          <g
            key={`beside-${b.id}`}
            pointerEvents="none"
            opacity={dim ? V2_NUM["opacity-map-dim"] : 1}
            {...uprightAnchor(beside.rect.x, beside.rect.y)}
          >
            <text
              x={beside.rect.x}
              y={beside.rect.y}
              fontSize={beside.fontSize}
              textAnchor="middle"
              dominantBaseline="central"
              fill={isSel ? C("map-label-selected") : C("fg-neutral-muted")}
              className={isSel ? "font-v2-ui font-v2-bold" : "font-v2-ui font-v2-regular"}
            >
              {b.name}
            </text>
          </g>
        );
      })}

      {route && <RouteLine route={route} ctx={ctx} />}

      {/* 길잡이 표식: 벽 바깥에 붙여 부스 칸을 덮지 않는다(map-markers.ts). 화장실 칩을 켜면 진하게 남는다. */}
      {floorplan &&
        wcMarkers(floorplan, fitScale).map((m, i) => (
          <g key={`wc-${i}`} {...uprightAnchor(m.x + m.w / 2, m.y + m.h / 2)}>
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
          <g key={`ent-${i}`} {...uprightAnchor(m.x + m.w / 2, m.y + m.h / 2)}>
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
  swap,
  fitLevel,
}: {
  booth: BoothListItem;
  g: MapRect;
  selected: boolean;
  visited: boolean;
  hearted: boolean;
  dim: boolean;
  /** 이름표를 칸의 가로세로를 바꿔 나눈다(지도가 90도 쪽으로 멈췄을 때). */
  swap: boolean;
  fitLevel?: number;
}) {
  const facility = b.kind === "facility";
  const stroke = V2_PX["stroke-width-s1"];
  const markerR = V2_PX["radius-r1"];
  const w = Math.max(8, g.w - CELL_GAP * 2);
  const h = Math.max(8, g.h - CELL_GAP * 2);
  // 이름표가 쓰는 칸(바로 선 글자 기준). 칸 그림(w×h)은 그대로 지도와 같이 돈다.
  const lw = swap ? h : w;
  const lh = swap ? w : h;
  const lcw = swap ? g.h : g.w;
  const lch = swap ? g.w : g.h;
  // 내 칸: 하트를 남긴 칸과 다녀온 칸(UI 22). 고른 칸과 편의시설 칸은 아니다(iOS `isMine`과 같다).
  // 다녀온 칸은 초록 면(UI 26-F4), 하트만 남긴 칸은 map-booth-mine. 이름과 하트 색은 둘 다 내 칸 색이다.
  const mine = !isSel && !facility && (hearted || visited);
  const fill = isSel
    ? C("map-booth-selected")
    : facility
      ? C("map-booth-facility")
      : visited
        ? C("map-booth-visited")
        : mine
          ? C("map-booth-mine")
          : C("map-booth");
  const text = isSel
    ? C("map-label-selected")
    : facility
      ? C("fg-neutral-muted")
      : mine
        ? C("map-label-mine")
        : C("map-label");
  // 다녀온 칸의 하트는 오른쪽 위 고정(UI 26-F4, 3002:4574). 하트만 남긴 칸은 UI 21 Q2 A 두 모양 그대로.
  const visitedHeart = hearted && visited;
  const heartCell = useMemo(
    () =>
      hearted && !visited
        ? heartCellLayout(
            b.name,
            lcw,
            lch,
            lw,
            lh,
            (fitLevel ?? 0) - LABEL_LEVELS_PER_OCTAVE,
          )
        : null,
    [hearted, visited, b.name, lcw, lch, lw, lh, fitLevel],
  );
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
      <g {...uprightAnchor(0, 0, g.rotate ?? 0)}>
        {heartCell ? (
          <HeartLabel
            cell={heartCell}
            color={text}
            selected={isSel}
            fallbackLevel={fitLevel ?? 0}
          />
        ) : (
          <CellLabel
            booth={b}
            cellW={lcw}
            cellH={lch}
            w={lw}
            h={lh}
            color={text}
            selected={isSel}
          />
        )}
        {visitedHeart && (
          <VisitedHeart
            w={lw}
            h={lh}
            color={isSel ? C("map-label-selected") : C("map-heart-mine")}
          />
        )}
      </g>
    </g>
  );
});

/** 다녀온 칸 오른쪽 위 하트(UI/지도/다녀온 칸 3002:4574). 짧은 변의 0.3, 안쪽 0.06(heartCorner). */
function VisitedHeart({ w, h, color }: { w: number; h: number; color: string }) {
  const c = heartCorner(w, h);
  return (
    <Heart
      data-mark="visited-heart"
      x={c.x}
      y={c.y}
      width={c.size}
      height={c.size}
      fill={color}
      stroke={color}
    />
  );
}

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
            <g {...uprightAnchor(start.x, start.y)}>
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

/**
 * 보통 칸과 편의시설 칸 이름표. 글자 크기와 줄은 iOS `BoothNameLabel`과 같은 토큰 규칙이다(헤더 11-22,
 * UI 21 A): 기준 크기는 점유 칸(`cellW`×`cellH`, 틈 빼기 전)으로 재고, 쓰는 폭은 안쪽 × `ratio.map-booth-name-width`.
 * 하트 칸(heart-cell.ts)과 같은 규칙이라 옆 칸과 이름 크기가 같다. `w`×`h`는 그리는 칸(자리 잡기용).
 */
function CellLabel({
  booth,
  cellW,
  cellH,
  w,
  h,
  color,
  selected,
}: {
  booth: BoothListItem;
  cellW: number;
  cellH: number;
  w: number;
  h: number;
  color: string;
  selected: boolean;
}) {
  const fontClass = selected
    ? "font-v2-ui font-v2-bold"
    : "font-v2-ui font-v2-regular";

  // 시설 칸: 어절 단위로 칸 안에 다 들어갈 때만 가운데에 그린다. 안 들어가면 칸 옆(MapLayerV2) 아니면 그리지 않는다.
  if (booth.kind === "facility") {
    const layout = layoutFacilityInside(booth.name, cellW, cellH);
    if (!layout) return null;
    const lineH = layout.fontSize * NAME_LINE_HEIGHT;
    const top = (-lineH * layout.lines.length) / 2;
    return (
      <text
        textAnchor="middle"
        fill={color}
        fontSize={layout.fontSize}
        className={fontClass}
      >
        {layout.lines.map((line, i) => (
          <tspan key={i} x={0} y={top + lineH * (i + 0.8)}>
            {line}
          </tspan>
        ))}
      </text>
    );
  }

  const base = labelBaseUnits(cellW, cellH);
  const inner = labelInner(cellW, cellH);
  const layout = layoutBoothLabel(
    booth.name,
    base,
    inner.w * NAME_WIDTH,
    inner.h,
    !!booth.code,
  );
  const lineH = layout.fontSize * NAME_LINE_HEIGHT;

  // 왼쪽 위 정렬: 번호 한 줄 + 이름(2994:798의 왼쪽 위 이름표).
  const padX = Math.min(w * 0.08, base * 0.6);
  const padY = Math.min(h * 0.08, base * 0.5);
  const codeSize = base * CODE_RATIO;
  const left = -w / 2 + padX;
  const top = -h / 2 + padY;
  const codeY = top + codeSize;
  const firstY = booth.code ? codeY + lineH * 1.05 : top + lineH;
  // 번호 줄만 배율에 따라 숨으므로 이름과 text를 나눈다. tspan엔 opacity가 걸리지 않는다.
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
      <text fill={color} className={fontClass}>
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
