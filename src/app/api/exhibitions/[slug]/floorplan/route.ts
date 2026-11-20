import { NextResponse } from "next/server";
import { notFound, ok } from "@/lib/api/http";
import { floorplanPayload, matchesEtag } from "@/lib/floorplan/delivery";
import { gateFairBySlug } from "@/lib/exhibition/open-gate";

type Ctx = { params: Promise<{ slug: string }> };

/**
 * 전시 도면. 지금까지 도면은 웹 번들 안에만 있어서(map-view가 FLOORPLANS를 직접
 * import) **iOS가 접근할 경로가 없었다.** 부스·히트맵·피드는 전부 엔드포인트가
 * 있는데 정작 지도를 그리는 재료만 없던 셈이다.
 *
 * venue 제원(미터·축척·표준부스)을 같이 실어 보낸다 — 클라이언트가 픽셀만 받으면
 * 거리·소요시간 같은 걸 계산할 수 없다. 미터를 알아야 실제 공간이 된다.
 *
 * version과 ETag(2026-11-17): 앱이 기기에 보관한 사본을 If-None-Match로 확인한다.
 * 같으면 304(본문 없음). 도면은 배포 때만 바뀌니 매번 다시 물어도 싸다.
 */
const CACHE = "public, max-age=0, must-revalidate";

export async function GET(req: Request, { params }: Ctx) {
  const { slug } = await params;
  // 지도에 놓인 부스가 없는 박람회는 방문객에게 내주지 않는다(lib/exhibition/open-gate.ts).
  const gated = await gateFairBySlug(slug);
  if (gated) return gated;
  const payload = floorplanPayload(slug);
  if (!payload) return notFound(`도면이 없는 행사예요: ${slug}`);
  const etag = `"${payload.version}"`;
  if (matchesEtag(req.headers.get("if-none-match"), payload.version)) {
    return new NextResponse(null, { status: 304, headers: { ETag: etag, "Cache-Control": CACHE } });
  }
  return ok(
    {
      floorplan: payload.floorplan,
      venue: payload.venue,
      version: payload.version,
      scale: payload.scale,
    },
    { headers: { ETag: etag, "Cache-Control": CACHE } },
  );
}
