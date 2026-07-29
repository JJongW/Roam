// 코엑스 전시홀 실측 제원. 출처: business.coex.co.kr (2026-07-29 확인).
// 새 전시 도면을 받았을 때 홀만 알면 바로 좌표계를 잡을 수 있게 상수로 둔다.
// 부스 치수를 미터로 환산해 표준부스로 떨어지는지 보면 스케일이 검증된다.
export interface CoexHall {
  name: string;
  /** 가로 × 세로 (m) */
  m: readonly [number, number];
  /** 도면기준 면적 (㎡) */
  area: number;
  /** 표준부스 기준 최대 부스 수 */
  booths: number;
  /** 표준부스 크기 (m). 더 플라츠만 3×2, 나머지는 3×3. */
  standardBooth: readonly [number, number];
  /** 기둥 간격 (m). 무주공간이면 없음. */
  pillarPitch?: number;
}

export const COEX_HALLS = {
  "hall-a": { name: "A홀", m: [144.0, 72.0], area: 10368, booths: 520, standardBooth: [3, 3] },
  "hall-b": { name: "B홀", m: [90.0, 81.0], area: 8010, booths: 360, standardBooth: [3, 3] },
  "hall-c": { name: "C홀", m: [144.0, 72.0], area: 10348, booths: 520, standardBooth: [3, 3], pillarPitch: 18 },
  "hall-d": { name: "D홀", m: [81.0, 81.0], area: 7281, booths: 360, standardBooth: [3, 3] },
  "the-platz": { name: "더 플라츠", m: [63.0, 35.3], area: 2224, booths: 114, standardBooth: [3, 2] },
} as const satisfies Record<string, CoexHall>;

export type CoexHallId = keyof typeof COEX_HALLS;
