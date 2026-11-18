import { ok } from "@/lib/api/http";
import { floorplanPayload, floorplanSlugs } from "@/lib/floorplan/delivery";

/**
 * 도면이 있는 박람회 목록과 버전. 앱이 기기에 받아 둔 도면 중 무엇이 낡았는지 한 번에
 * 알 수 있게(전부 다시 받지 않게). 도면 본문은 /api/exhibitions/{slug}/floorplan.
 * 봉투는 한 겹이다: `{ data: [{ slug, version, hasScale }] }`. 예전엔 `ok({ data: [...] })`라
 * `{ data: { data: [...] } }` 두 겹이었다(2026-11-18 고침, 쓰던 클라이언트 없음).
 */
export async function GET() {
  return ok(
    floorplanSlugs().map((slug) => {
      const p = floorplanPayload(slug)!;
      return { slug, version: p.version, hasScale: p.scale != null };
    }),
  );
}
