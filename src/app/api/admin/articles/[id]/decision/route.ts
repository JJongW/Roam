import { z } from "zod";
import { fail, getAdminActor, notFound, ok, parseBody, requireAdmin, withErrorBoundary } from "@/lib/api/http";
import { getRepository } from "@/lib/repositories";
import { decideArticle, REJECT_REASON_MAX } from "@/lib/articles/decision";

type Ctx = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  action: z.enum(["approve", "reject"]),
  /** 반려 이유(선택). 반려한 주제는 다음 초안에서 빠진다. */
  reason: z.string().max(REJECT_REASON_MAX).optional(),
});

/**
 * 아티클 승인과 반려. 관리자 로그인이 필요하고 POST만 받는다 — 슬랙 서명 링크는 이 화면을
 * 열기만 하고, 바꾸는 건 화면에서 한 번 더 누르는 이 요청이다(GET으로 상태가 바뀌지 않는다).
 */
export async function POST(req: Request, { params }: Ctx) {
  return withErrorBoundary(req, async () => {
    const denied = await requireAdmin();
    if (denied) return denied;
    const { id } = await params;
    const parsed = await parseBody(req, bodySchema);
    if (!parsed.ok) return parsed.res;

    const repo = await getRepository();
    const r = await decideArticle(repo, id, parsed.data.action, await getAdminActor(), parsed.data.reason);
    if (!r.ok && r.reason === "not-found") return notFound("아티클을 찾을 수 없어요");
    if (!r.ok) return fail("CONFLICT", "이미 결정된 아티클이에요", { status: [r.article.status] });
    return ok({ article: r.article });
  });
}
