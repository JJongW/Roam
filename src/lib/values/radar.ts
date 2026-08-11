import { VALUE_TAGS } from "@/lib/values";

/**
 * 취향 레이더 좌표 계산 — 순수. I/O 없음, DOM 없음.
 *
 * 컴포넌트 안에 삼각함수를 두면 테스트가 닿지 않는다. 각도·클램프·라벨 정렬은
 * 눈으로 검증하기 가장 어려운 부분이라 여기로 뺀다.
 *
 * 좌표계는 중심 (0,0), 첫 축이 12시, 시계 방향. 호출부가 SVG에서 원하는 만큼
 * translate 한다.
 */

/** 축은 VALUE_TAGS 정의 순서로 고정한다 — 순서가 바뀌면 과거 모양과 비교가 안 된다. */
export const RADAR_AXES = VALUE_TAGS.map((v) => ({
  slug: v.slug,
  label: v.label,
}));

const N = RADAR_AXES.length;
/** 라벨은 그리드 바깥에 둔다. 1.26은 8각형 꼭짓점과 안 겹치는 최소치. */
const LABEL_RATIO = 1.26;

function angleOf(i: number): number {
  return -Math.PI / 2 + (2 * Math.PI * i) / N;
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.min(1, Math.max(0, v));
}

export interface RadarPoint {
  slug: string;
  label: string;
  /** 0~1로 잘린 값. */
  frac: number;
  x: number;
  y: number;
  labelX: number;
  labelY: number;
  anchor: "start" | "middle" | "end";
}

/**
 * 8축 전부를 낸다 — 값이 없는 축도 frac 0으로 남긴다. "안 채운 쪽"이 같이 보여야
 * 치우침이 읽히기 때문이다(원 크기 방식이 실패한 지점).
 */
export function radarPoints(
  values: Record<string, number>,
  radius: number,
): RadarPoint[] {
  return RADAR_AXES.map((axis, i) => {
    const a = angleOf(i);
    const frac = clamp01(values[axis.slug] ?? 0);
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    return {
      slug: axis.slug,
      label: axis.label,
      frac,
      x: cos * radius * frac,
      y: sin * radius * frac,
      labelX: cos * radius * LABEL_RATIO,
      labelY: sin * radius * LABEL_RATIO,
      // 수평 성분이 작으면(12시·6시) 가운데 정렬. 아니면 바깥쪽으로 민다.
      anchor:
        Math.abs(cos) < 0.35 ? "middle" : cos > 0 ? "start" : "end",
    };
  });
}

/** 그리드 링 하나의 SVG points 문자열. */
export function ringPolygon(frac: number, radius: number): string {
  const f = clamp01(frac);
  return RADAR_AXES.map((_, i) => {
    const a = angleOf(i);
    return `${(Math.cos(a) * radius * f).toFixed(2)},${(Math.sin(a) * radius * f).toFixed(2)}`;
  }).join(" ");
}
