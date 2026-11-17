// 도면을 iOS로 내보내는 모양(2026-11-17, 헤더 기본값 6: 서버에서 받고 기기에 보관).
//
// version은 내보내는 내용(도면 + 장소 제원)의 해시다. 도면 JSON이나 장소가 바뀌어
// 배포되면 저절로 바뀐다 — 손으로 올리는 번호를 두면 잊는다. 앱은 이 값을 ETag로
// 다시 물어(If-None-Match) 304면 기기 사본을 그대로 쓴다.
//
// 축척(scale.unitsPerMeter): 장소(venue) 위에 합성한 도면만 있다. 주최 배치도를 그대로
// 옮긴 도면(cafeshow, ddp-designfair, seoul-furniture-show)과 개략도(sibf)는 미터 환산
// 정보가 없어 null이다 — "걸어서 N분"을 그 박람회에선 계산하지 않는다.
import { createHash } from "node:crypto";
import { FLOORPLANS, VENUE_OF, type Floorplan } from "@/lib/floorplans";

export interface FloorplanPayload {
  slug: string;
  version: string;
  scale: { unitsPerMeter: number } | null;
  floorplan: Floorplan;
  venue: {
    id: string;
    name: string;
    floor?: unknown;
    meters: { w: number; h: number };
    unitsPerMeter: number;
    standardBoothMeters?: unknown;
  } | null;
}

const cache = new Map<string, FloorplanPayload>();

export function floorplanSlugs(): string[] {
  return Object.keys(FLOORPLANS).sort();
}

export function floorplanPayload(slug: string): FloorplanPayload | null {
  const hit = cache.get(slug);
  if (hit) return hit;
  const floorplan = FLOORPLANS[slug];
  if (!floorplan) return null;
  const v = VENUE_OF[slug];
  const venue = v
    ? {
        id: v.id,
        name: v.name,
        floor: v.floor,
        meters: v.meters,
        unitsPerMeter: v.unitsPerMeter,
        standardBoothMeters: v.standardBoothMeters,
      }
    : null;
  const version = createHash("sha256")
    .update(JSON.stringify({ floorplan, venue }))
    .digest("hex")
    .slice(0, 16);
  const payload: FloorplanPayload = {
    slug,
    version,
    scale: venue ? { unitsPerMeter: venue.unitsPerMeter } : null,
    floorplan,
    venue,
  };
  cache.set(slug, payload);
  return payload;
}

/** If-None-Match가 이 버전과 같은지. 따옴표, W/ 접두, 여러 값을 받아 준다. */
export function matchesEtag(header: string | null, version: string): boolean {
  if (!header) return false;
  return header
    .split(",")
    .map((t) => t.trim().replace(/^W\//, "").replace(/"/g, ""))
    .some((t) => t === version || t === "*");
}
