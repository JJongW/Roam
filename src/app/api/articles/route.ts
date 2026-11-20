import { fail, ok, withErrorBoundary } from "@/lib/api/http";
import { getRepository } from "@/lib/repositories";
import { isPublishable, publicArticle } from "@/lib/articles/decision";

/**
 * 승인된 아티클 목록(공개, 로그인 없음). Ted가 승인한 것만 나간다 — draft와 rejected는 이 길로 못 나온다.
 *   ?exhibitorId=<브랜드 id>   그 브랜드를 다룬 것만
 *   ?exhibitorIds=a,b,c        그 브랜드들 중 하나라도 다룬 것(앱 마이 하트 브랜드, UI 17-04). 50개까지
 *   ?exhibitionId=<행사 id>    그 행사를 다룬 것만
 *   ?limit=1..50 (기본 20)
 * 허락 받은 사진이 한 장도 남지 않는 글은 나가지 않는다(isPublishable, 사진 필수 11-19).
 * iOS UI 17 아티클(홈 매거진 줄, 부스 상세, 부스 목록 아래, 마이 하트 브랜드)이 쓴다.
 */
export async function GET(req: Request) {
  return withErrorBoundary(req, async () => {
    const url = new URL(req.url);
    const limit = Number(url.searchParams.get("limit") ?? 20);
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) return fail("VALIDATION", "limit은 1부터 50까지예요");
    const exhibitorId = url.searchParams.get("exhibitorId");
    const exhibitorIds = (url.searchParams.get("exhibitorIds") ?? "").split(",").map((x) => x.trim()).filter(Boolean);
    if (exhibitorIds.length > 50) return fail("VALIDATION", "exhibitorIds는 50개까지예요");
    const exhibitionId = url.searchParams.get("exhibitionId");
    const repo = await getRepository();
    const rows = (await repo.listArticles({ status: ["approved"], limit: 500 }))
      .filter(isPublishable)
      .filter((a) => !exhibitorId || a.exhibitorIds.includes(exhibitorId))
      .filter((a) => !exhibitorIds.length || a.exhibitorIds.some((x) => exhibitorIds.includes(x)))
      .filter((a) => !exhibitionId || a.exhibitionIds.includes(exhibitionId))
      // 승인 순서(최근 승인 먼저)가 공개 순서다.
      .sort((a, b) => (b.decidedAt ?? "").localeCompare(a.decidedAt ?? ""))
      .slice(0, limit);
    return ok({ articles: rows.map(publicArticle) });
  });
}
