import { notFound, ok } from "@/lib/api/http";
import { FLOORPLANS, VENUE_OF } from "@/lib/floorplans";

type Ctx = { params: Promise<{ slug: string }> };

/**
 * 전시 도면. 지금까지 도면은 웹 번들 안에만 있어서(map-view가 FLOORPLANS를 직접
 * import) **iOS가 접근할 경로가 없었다.** 부스·히트맵·피드는 전부 엔드포인트가
 * 있는데 정작 지도를 그리는 재료만 없던 셈이다.
 *
 * venue 제원(미터·축척·표준부스)을 같이 실어 보낸다 — 클라이언트가 픽셀만 받으면
 * 거리·소요시간 같은 걸 계산할 수 없다. 미터를 알아야 실제 공간이 된다.
 */
export async function GET(_req: Request, { params }: Ctx) {
  const { slug } = await params;
  const floorplan = FLOORPLANS[slug];
  if (!floorplan) return notFound(`도면이 없는 전시입니다: ${slug}`);
  const venue = VENUE_OF[slug];
  return ok({
    floorplan,
    venue: venue
      ? {
          id: venue.id,
          name: venue.name,
          floor: venue.floor,
          meters: venue.meters,
          unitsPerMeter: venue.unitsPerMeter,
          standardBoothMeters: venue.standardBoothMeters,
        }
      : null,
  });
}
