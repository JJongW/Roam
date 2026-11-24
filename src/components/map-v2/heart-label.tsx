import { Heart } from "lucide-react";
import type { CSSProperties } from "react";
import {
  LABEL_LEVELS_PER_OCTAVE,
  labelFadeStyle,
  levelBandStyle,
  zoomVar,
} from "@/components/map/map-camera";
import { NAME_LINE_HEIGHT } from "@/components/map/booth-label";
import {
  HEART_GAP_PX,
  HEART_ICON_PX,
  type HeartCellLayout,
} from "./heart-cell";

const C = (name: string) => `var(--roam-v2-color-${name})`;

/**
 * 하트 칸 이름표(UI 21 Q2 A). 작은 모양과 큰 모양을 다 그려 두고 라벨 단계로 바꿔 끼운다(heart-cell.ts).
 * 어느 단계에서든 둘 중 하나는 보인다 — 이름은 숨기지 않는다(2026-10-15 결정).
 *
 * 큰 모양의 하트와 사이는 화면 px(16, 4)이다. 층을 다시 그리지 않으므로 CSS가 단계에서
 * "화면 1px = 도면 2^(−단계/4)" 를 계산해 하트를 줄이고 이름을 옮긴다.
 */
export function HeartLabel({
  cell,
  color,
  selected,
  fallbackLevel,
}: {
  cell: HeartCellLayout;
  /** 칸 이름 글자 색(고른 칸이면 map-label-selected, 아니면 map-label-mine). */
  color: string;
  selected: boolean;
  /** 엔진이 단계를 아직 안 적었을 때 쓸 단계. */
  fallbackLevel: number;
}) {
  // 하트 칸은 내 칸이라 하트와 이름을 내 칸 색으로 그린다(UI 22).
  const heartColor = selected ? color : C("map-heart-mine");
  const nameColor = selected ? color : C("map-label-mine");
  const { heart, name } = cell.small;
  // 화면 1px이 도면 몇 단위인지. 하트 크기 계산은 largeFrom 아래로 내려가지 않는다(그 아래는 지도와 같이 줄어든다).
  const k = `pow(2, calc(max(${zoomVar(fallbackLevel)}, ${cell.largeFrom}) / ${-LABEL_LEVELS_PER_OCTAVE}))`;
  const half = (HEART_ICON_PX + HEART_GAP_PX) / 2;
  return (
    <>
      <g style={labelFadeStyle(cell.level, 1, { below: true, fallback: fallbackLevel })}>
        <Heart
          x={heart.x}
          y={heart.y}
          width={heart.size}
          height={heart.size}
          fill={heartColor}
          stroke={heartColor}
        />
        <NameLines
          lines={name.lines}
          fontSize={name.fontSize}
          color={nameColor}
          anchor="middle"
          x={0}
        />
      </g>
      <g style={labelFadeStyle(cell.level, 1, { fallback: fallbackLevel })}>
        {cell.large.map((band) => {
          const left = -band.blockW / 2;
          const heartStyle: CSSProperties = {
            transform: `translate(calc(${left}px - ${half}px * ${k}), 0px) scale(${k})`,
          };
          const nameStyle: CSSProperties = {
            transform: `translate(calc(${half}px * ${k}), 0px)`,
          };
          return (
            <g key={band.from} style={levelBandStyle(band.from, band.to, fallbackLevel)}>
              <g style={heartStyle}>
                <Heart
                  x={0}
                  y={-HEART_ICON_PX / 2}
                  width={HEART_ICON_PX}
                  height={HEART_ICON_PX}
                  fill={heartColor}
                  stroke={heartColor}
                />
              </g>
              <g style={nameStyle}>
                <NameLines
                  lines={band.name.lines}
                  fontSize={band.name.fontSize}
                  color={nameColor}
                  anchor="start"
                  x={left}
                />
              </g>
            </g>
          );
        })}
      </g>
    </>
  );
}

/** 이름 줄을 세로 가운데로 쌓는다. 줄마다 줄 상자 가운데에 놓는다(iOS `drawLines`). */
function NameLines({
  lines,
  fontSize,
  color,
  anchor,
  x,
}: {
  lines: string[];
  fontSize: number;
  color: string;
  anchor: "middle" | "start";
  x: number;
}) {
  const lineH = fontSize * NAME_LINE_HEIGHT;
  const top = (-lineH * lines.length) / 2;
  return (
    <text
      textAnchor={anchor}
      dominantBaseline="central"
      fill={color}
      fontSize={fontSize}
      className="font-v2-ui font-v2-bold"
    >
      {lines.map((line, i) => (
        <tspan key={i} x={x} y={top + lineH * (i + 0.5)}>
          {line}
        </tspan>
      ))}
    </text>
  );
}
