import type {
  Floorplan,
  FloorplanBooth,
  FloorplanDecor,
  FloorplanGate,
  FloorplanRect,
} from "@/lib/floorplans";

/**
 * 장소(venue) — 벽·입출구·화장실·장식처럼 **전시가 아니라 건물에 속한 것**.
 * 코엑스 홀별로 한 번 저작하면 그 홀에서 열리는 모든 전시가 재사용한다.
 *
 * 좌표는 venue 단위(= unitsPerMeter). 미터 제원을 같이 들고 있어야 새 도면을
 * 받았을 때 "표준부스가 3×3m(플라츠는 3×2m)로 깨끗하게 떨어지나"로 스케일을
 * 검증할 수 있다.
 */
export interface Venue {
  id: string;
  name: string;
  floor?: number;
  meters: { w: number; h: number };
  unitsPerMeter: number;
  standardBoothMeters: { w: number; h: number };
  columnSpacingMeters?: number;
  entrance?: { x: number; y: number };
  exit?: { x: number; y: number };
  gates?: FloorplanGate[];
  decor?: FloorplanDecor[];
  interior?: FloorplanRect[];
  notes?: string;
}

/** 전시 배치 — 그 장소 위에 이번 전시가 부스를 어떻게 놓았나. 이것만 전시별이다. */
export interface Layout {
  venue: string;
  width: number;
  height: number;
  unitsPerMeter?: number;
  booths: LayoutBooth[];
}

export interface LayoutBooth {
  code: string;
  /** 좌상단 기준 — 합성기가 중심 기준으로 바꾼다(exhibition-map이 중심으로 그린다). */
  x: number;
  y: number;
  w: number;
  h: number;
  zone?: string;
  kind?: string;
  color?: string;
}

const ZONE: Record<string, string> = {
  general: "#dcdee3",
  art: "#ff7a33",
  highlight: "#f5b500",
  lounge: "#4cb8e8",
  special: "#8c82c8",
};

/** 시설(라운지·센터·스테이지)은 일반 부스(#dcdee3)와 구분되는 짙은 중립 회색.
 *  방문/이따 상태색과 부딪히는 선명한 색은 쓰지 않는다. */
const FACILITY_FILL = "#aeb4bf";

function bbox(rects: FloorplanRect[]): FloorplanRect {
  const pad = 40;
  const x = Math.min(...rects.map((r) => r.x - r.w / 2)) - pad;
  const y = Math.min(...rects.map((r) => r.y - r.h / 2)) - pad;
  return {
    x,
    y,
    w: Math.max(...rects.map((r) => r.x + r.w / 2)) + pad - x,
    h: Math.max(...rects.map((r) => r.y + r.h / 2)) + pad - y,
  };
}

/**
 * venue + layout → Floorplan. 전시별 build 함수를 대체한다.
 *
 * 새 전시를 붙일 때 벽·입구·화장실을 다시 적지 않는다 — 어느 장소인지만 말하면
 * 그건 venue가 안다. 전시가 말하는 건 부스 배치뿐이다.
 */
export function composeFloorplan(layout: Layout, venue: Venue): Floorplan {
  const booths: FloorplanBooth[] = layout.booths.map((b) => ({
    code: b.code,
    // JSON은 좌상단, FloorplanBooth는 중심.
    x: b.x + b.w / 2,
    y: b.y + b.h / 2,
    w: b.w,
    h: b.h,
    color:
      b.kind === "facility"
        ? FACILITY_FILL
        : (b.color ?? ZONE[b.zone ?? "general"] ?? ZONE.general),
  }));

  // 입출구를 아직 확인 못 한 장소는 하단 중앙을 임시 기점으로 쓴다. 없는 위치를
  // venue 파일에 지어 넣으면 그 홀에서 열리는 다음 전시까지 그 거짓말을 물려받는다.
  const fallback = { x: layout.width / 2, y: layout.height - 60 };

  return {
    width: layout.width,
    height: layout.height,
    halls: [],
    decor: venue.decor ?? [],
    booths,
    interior: venue.interior ?? [bbox(booths)],
    entrance: venue.entrance ?? fallback,
    exit: venue.exit ?? fallback,
    ...(venue.gates?.length ? { gates: venue.gates } : {}),
  };
}
