import { z } from "zod";
import { fail, getUserId, notFound, ok, parseBody, requireAdmin } from "@/lib/api/http";
import { getRepository } from "@/lib/repositories";
import { hasGemini } from "@/lib/ai/gemini";
import { runDraftBatch } from "@/lib/enrichment/run-draft";

/** 라우트에서 바로 돌릴 수 있는 상한. 실측 10부스=49초라 Vercel 함수 상한에
 *  금방 닿는다 — 이보다 크면 워커가 큐에서 집게 한다. */
const INLINE_MAX = 10;
/** 큐로 넘길 때의 상한. 워커는 시간 제약이 없지만 요금은 있다. */
const QUEUE_MAX = 1000;

const bodySchema = z.object({
  exhibitionSlug: z.string().min(1),
  codes: z.array(z.string()).optional(),
  limit: z.number().int().min(1).max(QUEUE_MAX).default(10),
  /** true면 큐에만 넣고 바로 돌려준다. limit이 INLINE_MAX를 넘으면 강제된다. */
  queue: z.boolean().optional(),
});

/**
 * 자동 초안. **아무것도 운영에 반영하지 않는다** — enrichment_candidate에
 * pending으로만 쌓이고 사람이 승인해야 booth_enrichment로 간다.
 *
 * 작은 배치는 여기서 바로 돌고, 큰 배치는 잡 큐로 넘어가 맥미니 워커가 집는다.
 * 실행 로직은 `runDraftBatch` 하나를 공유한다 — 실행 위치가 달라도 규칙이 갈리면
 * 안 된다.
 */
export async function POST(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const parsed = await parseBody(req, bodySchema);
  if (!parsed.ok) return parsed.res;
  const { exhibitionSlug, codes, limit } = parsed.data;

  const repo = await getRepository();
  const exhibitionId = await repo.getExhibitionIdBySlug(exhibitionSlug);
  if (!exhibitionId) return notFound(`전시를 찾을 수 없습니다: ${exhibitionSlug}`);

  const viaQueue = parsed.data.queue || limit > INLINE_MAX;
  if (viaQueue) {
    const job = await repo.enqueueJob({
      type: "enrichment_draft",
      payload: { exhibitionSlug, codes, limit, actor: await getUserId() },
    });
    return ok({
      queued: true,
      jobId: job.id,
      note: `${limit}부스는 워커가 처리합니다 — 라우트에서 바로 돌리기엔 깁니다(실측 10부스 ≈ 49초).`,
    });
  }

  if (!hasGemini) {
    return fail("UNPROCESSABLE", "GEMINI_API_KEY가 없어 초안을 만들 수 없습니다");
  }
  const result = await runDraftBatch(repo, {
    exhibitionSlug,
    codes,
    limit,
    actor: await getUserId(),
  });
  if ("error" in result) return notFound(result.error);
  return ok({ queued: false, ...result });
}
