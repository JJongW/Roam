import { NextResponse } from "next/server";
import { getRepository } from "@/lib/repositories";
import { parseBody } from "@/lib/api/http";
import { ensureSession } from "@/lib/api/session";
import { analyticsEventInputSchema } from "@/lib/schemas";

// Fire-and-forget visitor analytics ingestion.
export async function POST(req: Request) {
  const parsed = await parseBody(req, analyticsEventInputSchema);
  if (!parsed.ok) return parsed.res;
  const repo = await getRepository();
  // 세션은 재사용되면 exhibitionId가 최초 생성 시점 값으로 고정된다 — 이 이벤트가
  // 실제로 어느 전시인지는 부스에서 직접 구해 세션 값보다 우선한다(그래야 세션이
  // "unknown"으로 굳어 있었거나 다른 전시에서 만들어졌어도 이 이벤트는 정확하다).
  const booth = parsed.data.boothId ? await repo.getBooth(parsed.data.boothId) : null;
  // 부스와 무관한 클릭(지도 컨트롤·피드 CTA·컴패니언 바 등)은 boothId가 없으므로
  // 클라이언트가 직접 보낸 exhibitionSlug로 귀속한다 — 세션 폴백은 같은 이유로
  // 신뢰할 수 없다(위 주석 참고).
  const exhibitionBySlug = parsed.data.exhibitionSlug
    ? await repo.getExhibition(parsed.data.exhibitionSlug)
    : null;
  const exhibitionId = booth?.exhibitionId ?? exhibitionBySlug?.exhibition.id;
  const session = await ensureSession(exhibitionId);
  await repo.recordAnalytics(session.id, exhibitionId ?? session.exhibitionId, parsed.data);
  return new NextResponse(null, { status: 202 });
}
