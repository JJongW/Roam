import { fail, ok, withErrorBoundary } from "@/lib/api/http";
import { getRepository } from "@/lib/repositories";
import { publicArticle } from "@/lib/articles/decision";

/**
 * 승인된 아티클 목록(공개, 로그인 없음). Ted가 승인한 것만 나간다 — draft와 rejected는 이 길로 못 나온다.
 *   ?exhibitorId=<브랜드 id>   그 브랜드를 다룬 것만
 *   ?exhibitionId=<행사 id>    그 행사를 다룬 것만
 *   ?limit=1..50 (기본 20)
 * 화면(웹 매거진, iOS)은 아직 없다. 이 API가 그 화면의 입구다.
 */
export async function GET(req: Request) {
  return withErrorBoundary(req, async () => {
    const url = new URL(req.url);
    const limit = Number(url.searchParams.get("limit") ?? 20);
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) return fail("VALIDATION", "limit은 1부터 50까지예요");
    const exhibitorId = url.searchParams.get("exhibitorId");
    const exhibitionId = url.searchParams.get("exhibitionId");
    const repo = await getRepository();
    const rows = (await repo.listArticles({ status: ["approved"], limit: 500 }))
      .filter((a) => !exhibitorId || a.exhibitorIds.includes(exhibitorId))
      .filter((a) => !exhibitionId || a.exhibitionIds.includes(exhibitionId))
      // 승인 순서(최근 승인 먼저)가 공개 순서다.
      .sort((a, b) => (b.decidedAt ?? "").localeCompare(a.decidedAt ?? ""))
      .slice(0, limit);
    return ok({ articles: rows.map(publicArticle) });
  });
}
