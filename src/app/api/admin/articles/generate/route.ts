import { z } from "zod";
import { ok, parseBody, requireAdmin, withErrorBoundary } from "@/lib/api/http";
import { getRepository } from "@/lib/repositories";
import { ARTICLE_DRAFT_JOB } from "@/lib/articles/jobs";

const bodySchema = z.object({ kind: z.enum(["brand_intro", "fair_roundup"]).optional() });

/**
 * 새 아티클 초안을 워커에 맡긴다(잡 큐). 매일 한 편은 점검(kr.roam.sweep)이 알아서 만들고,
 * 이 버튼은 그 사이에 하나 더 보고 싶을 때만. LLM과 게이트가 라우트 시간 상한에 걸리지 않게 워커에서 돈다.
 */
export async function POST(req: Request) {
  return withErrorBoundary(req, async () => {
    const denied = await requireAdmin();
    if (denied) return denied;
    const parsed = await parseBody(req, bodySchema);
    if (!parsed.ok) return parsed.res;
    const repo = await getRepository();
    const job = await repo.enqueueJob({ type: ARTICLE_DRAFT_JOB, payload: { kind: parsed.data.kind }, maxAttempts: 2 });
    return ok({ jobId: job.id });
  });
}
