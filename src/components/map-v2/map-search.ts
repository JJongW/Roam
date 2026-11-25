import type { BoothListItem } from "@/lib/types";

/**
 * 지도 찾기(UI 3-04 ~ 3-06). 이름, 상호, 부스 번호, 다른 이름으로 찾는다.
 * 시설 칸(무대, 특별전, 편의시설)도 찾는다 — iOS `FairMapModel.search`와 같다(2026-11-24 P1-2).
 * 시설을 고르면 부스 카드 없이 지도만 그 칸으로 다가간다(`isCardResult`가 아닌 것).
 */
export function searchMapBooths(booths: BoothListItem[], query: string): BoothListItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return booths.filter((b) =>
    [b.name, b.company, b.code, ...(b.aliases ?? [])].some((t) =>
      t?.toLowerCase().includes(q),
    ),
  );
}

/** 부스 카드로 보여 줄 결과인지. 시설 칸은 카드가 없다(Figma에 시설 카드 화면이 없음, iOS `cardResults`). */
export function isCardResult(b: BoothListItem): boolean {
  return b.kind !== "facility";
}
