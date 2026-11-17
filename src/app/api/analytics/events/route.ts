import { NextResponse } from "next/server";
import { z } from "zod";
import { getRepository } from "@/lib/repositories";
import type { Repository } from "@/lib/repositories/types";
import { parseBody } from "@/lib/api/http";
import { ensureSession } from "@/lib/api/session";
import { getUserId } from "@/lib/api/http";
import {
  analyticsEventInputSchema,
  appEventBatchSchema,
  type AnalyticsEventInput,
  type AppEventBatchInput,
} from "@/lib/schemas";
import { sanitizeProps } from "@/lib/analytics/app-events";
import type { AppEventRow } from "@/lib/types";

// 두 모양을 받는다. 키 `events`가 있으면 앱 묶음, 없으면 웹 단건(옛 모양 그대로).
const bodySchema = z.union([appEventBatchSchema, analyticsEventInputSchema]);

// Fire-and-forget visitor analytics ingestion.
export async function POST(req: Request) {
  const parsed = await parseBody(req, bodySchema);
  if (!parsed.ok) return parsed.res;
  const repo = await getRepository();
  if ("events" in parsed.data) return recordBatch(repo, parsed.data);
  return recordSingle(repo, parsed.data);
}

/**
 * iOS(앞으로 Android)가 묶어 보내는 이름 붙은 이벤트(화면 설계서 E 2-2).
 * 로그인했으면 Bearer(또는 쿠키)로 user_id를 같이 적고, 아니면 anon_id만 남긴다.
 * 박람회 없는 이벤트도 받는다. 같은 eventId가 다시 오면 건너뛴다.
 * 위치, 메모, 회고 글 같은 속성은 지운다(lib/analytics/app-events.ts).
 */
async function recordBatch(repo: Repository, body: AppEventBatchInput) {
  const userId = await getUserId();

  // 박람회는 slug로만 받고 서버가 id로 바꾼다. 부스는 있는 부스만 남긴다 — 없는 id를
  // 그대로 넣으면 FK 위반으로 묶음 전체가 떨어진다.
  const slugs = [...new Set(body.events.map((e) => e.exhibitionSlug).filter(Boolean))] as string[];
  const boothIds = [...new Set(body.events.map((e) => e.boothId).filter(Boolean))] as string[];
  const exIdBySlug = new Map<string, string | null>();
  await Promise.all(
    slugs.map(async (s) => exIdBySlug.set(s, await repo.getExhibitionIdBySlug(s))),
  );
  const exIdByBooth = new Map<string, string | null>();
  await Promise.all(
    boothIds.map(async (id) => exIdByBooth.set(id, (await repo.getBooth(id))?.exhibitionId ?? null)),
  );

  const rows: AppEventRow[] = body.events.map((e) => {
    const boothEx = e.boothId ? exIdByBooth.get(e.boothId) : null;
    const slugEx = e.exhibitionSlug ? exIdBySlug.get(e.exhibitionSlug) : null;
    return {
      eventId: e.eventId,
      name: e.name,
      clientTs: e.clientTs,
      platform: body.platform,
      appVersion: body.appVersion,
      anonId: body.anonId,
      appSessionId: body.sessionId,
      screenId: e.screenId,
      userId,
      exhibitionId: boothEx ?? slugEx ?? null,
      boothId: boothEx ? e.boothId! : null,
      props: sanitizeProps(e.props).props,
    };
  });
  await repo.recordAppEvents(rows);
  return NextResponse.json({ data: { received: rows.length } }, { status: 202 });
}

async function recordSingle(repo: Repository, data: AnalyticsEventInput) {
  // 세션은 재사용되면 exhibitionId가 최초 생성 시점 값으로 고정된다 — 이 이벤트가
  // 실제로 어느 전시인지는 부스에서 직접 구해 세션 값보다 우선한다(그래야 세션이
  // "unknown"으로 굳어 있었거나 다른 전시에서 만들어졌어도 이 이벤트는 정확하다).
  const booth = data.boothId ? await repo.getBooth(data.boothId) : null;
  // 부스와 무관한 클릭(지도 컨트롤·피드 CTA·컴패니언 바 등)은 boothId가 없으므로
  // 클라이언트가 보낸 exhibitionId(직접, 조회 없음)나 exhibitionSlug(slug→id 조회)로
  // 귀속한다 — 세션 폴백은 같은 이유로 신뢰할 수 없다(위 주석 참고). exhibitionId가
  // 있으면 slug 조회 자체를 건너뛴다(불필요한 DB 왕복 방지).
  let exhibitionId = booth?.exhibitionId ?? data.exhibitionId;
  if (!exhibitionId && data.exhibitionSlug) {
    exhibitionId = (await repo.getExhibitionIdBySlug(data.exhibitionSlug)) ?? undefined;
  }
  const session = await ensureSession(exhibitionId);
  // 방문객 앱 전체가 로그인 게이트 뒤(src/proxy.ts)라 실질적으로 항상 값이 있다.
  // 익명 세션 인프라가 공존하므로 없으면 null로 두되, 있는데 안 적으면 취향×행동
  // 교차 분석이 영구히 불가능해진다(소급 복구 불가) — 반드시 함께 적재한다.
  const userId = await getUserId();
  await repo.recordAnalytics(session.id, exhibitionId ?? session.exhibitionId, data, userId);
  return new NextResponse(null, { status: 202 });
}
