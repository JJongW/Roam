import { getAdminActor, ok, parseBody, requireAdmin, withErrorBoundary } from "@/lib/api/http";
import { getRepository } from "@/lib/repositories";
import { linkDecisionBatchSchema } from "@/lib/schemas";

/**
 * 연결 확인 목록 일괄 처리. 연결(approved) = 그 출전의 브랜드를 대상 브랜드에 합친다.
 * 연결 안 함(rejected) = 짝을 기억해 다음 백필이 다시 묻지 않는다.
 *
 * 순서대로 하나씩 한다 — 합치기는 다른 후보의 대상을 지울 수 있어서(앞의 승인이 뒤
 * 후보를 superseded로 만든다) 병렬로 돌리면 이미 사라진 브랜드에 합치려 든다.
 * 한 줄이 실패해도 나머지는 계속하고, 줄마다 결과를 돌려준다.
 */
export async function POST(req: Request) {
  return withErrorBoundary(req, async () => {
    const denied = await requireAdmin();
    if (denied) return denied;
    const parsed = await parseBody(req, linkDecisionBatchSchema);
    if (!parsed.ok) return parsed.res;
    const { ids, decision } = parsed.data;
    const repo = await getRepository();
    const actor = await getAdminActor();
    const results: { id: string; status: string | null; error?: string }[] = [];
    for (const id of [...new Set(ids)]) {
      try {
        const c = await repo.decideExhibitorLinkCandidate(id, decision, actor);
        results.push({ id, status: c?.status ?? null, ...(c ? {} : { error: "후보를 찾을 수 없어요" }) });
      } catch (e) {
        results.push({ id, status: null, error: e instanceof Error ? e.message : String(e) });
      }
    }
    const done = results.filter((r) => r.status === decision).length;
    return ok({ results, done, skipped: results.length - done });
  });
}
