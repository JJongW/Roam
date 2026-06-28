// 부스 크기(floorplan 면적) → 체류 시간(분) 주입.
// Booth 도메인 객체엔 w/h가 없고 floorplan(번들)에만 있으므로, 코드(자연키)로
// 매칭해 런타임에 dwellMinutes를 채운다. mock·supabase 두 모드 모두 동작.
import { FLOORPLANS } from "@/lib/floorplans";
import { DWELL_TIERS } from "@/lib/constants";
import type { Booth } from "@/lib/types";

/** 면적(w×h) → 체류 분. 5단계: 제일 작은 스탠드 2분 … 가장 큰 부스 10분. */
export function dwellForArea(w: number, h: number): number {
  const area = w * h;
  for (const t of DWELL_TIERS) if (area < t.maxArea) return t.minutes;
  return DWELL_TIERS[DWELL_TIERS.length - 1].minutes;
}

/** 주어진 전시의 floorplan 기하로 booths 배열에 dwellMinutes를 채운다(제자리 변경). */
export function attachDwellMinutes(slug: string, booths: Booth[]): void {
  const fp = FLOORPLANS[slug];
  if (!fp) return;
  const byCode = new Map(
    fp.booths.map((b) => [b.code, dwellForArea(b.w, b.h)]),
  );
  for (const b of booths) {
    const d = b.code ? byCode.get(b.code) : undefined;
    if (d != null) b.dwellMinutes = d;
  }
}
