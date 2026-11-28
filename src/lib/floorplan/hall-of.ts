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

/**
 * 부스 하나로 갈 때(찾기에서 고르기, 지도에서 보기, 로미 "어디 있어요?") 홀 칩이 가리킬 홀.
 * 홀이 여럿인 도면이면 그 부스가 있는 홀로 바꾼다(iOS `focusOnResult`, `showOnMap`의 `currentHallId`).
 * 홀이 하나거나 칸이 어느 홀에도 안 들어가면 지금 고른 것을 그대로 둔다.
 */
export function hallForBooth(
  floorplan: Floorplan | undefined,
  code: string | undefined,
  current: string | null,
): string | null {
  if (!floorplan || floorplan.halls.length < 2) return current;
  return floorplanHallOf(floorplan, code) ?? current;
}

/**
 * 홀을 가르는 짧은 이름(홀 칩). iOS `FairMapModel.shortHallName`과 같은 규칙이다.
 * "Hall A" → "A홀", "코엑스 C홀" → "C홀", "킨텍스 제2전시장 6홀" → "6홀", "DDP 아트홀" → "아트홀".
 * 홀로 끝나는 말이 없으면 이름 그대로 둔다(앞 몇 글자만 자르면 "Hall A"가 "Hal"이 됐다, 2026-11-28).
 */
export function shortHallName(name: string): string {
  const t = name.trim();
  if (/^hall\s/i.test(t)) return `${t.slice(5).trim()}홀`;
  const last = t.split(/\s+/).pop() ?? t;
  return last.endsWith("홀") ? last : t;
}
