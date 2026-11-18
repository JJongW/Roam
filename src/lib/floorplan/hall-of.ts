import type { Floorplan } from "@/lib/floorplans";

/**
 * 부스가 놓인 배치도 홀의 이름. 지도에 적힌 홀 이름과 카드, 상세의 "A홀 A13"이 같은 말을
 * 하게 한다(UI 3-02, 4-02). 배치도가 없거나 칸이 어느 홀에도 안 들어가면 undefined —
 * 부르는 쪽이 부스 데이터의 홀 이름으로 떨어진다.
 */
export function floorplanHallOf(
  floorplan: Floorplan | undefined,
  code: string | undefined,
): string | undefined {
  if (!floorplan || !code) return undefined;
  const r = floorplan.booths.find((b) => b.code === code);
  if (!r) return undefined;
  return floorplan.halls.find(
    (h) => r.x >= h.x && r.x <= h.x + h.w && r.y >= h.y && r.y <= h.y + h.h,
  )?.name;
}
