import { created, getAdminActor, notFound, ok, requireAdmin, withErrorBoundary } from "@/lib/api/http";
import { getRepository } from "@/lib/repositories";
import { enqueueBrandDrafts } from "@/lib/brands/jobs";

type Ctx = { params: Promise<{ id: string }> };

/**
 * 브랜드 상세의 "초안 만들기". 잡 큐에 넣고 바로 돌려준다 — 실행은 워커가 한다
 * (자료 읽기와 LLM 호출이 라우트 시간 상한에 닿을 수 있다). 이미 대기 중이면 다시 넣지 않는다.
 */
export async function POST(req: Request, { params }: Ctx) {
  return withErrorBoundary(req, async () => {
    const denied = await requireAdmin();
    if (denied) return denied;
    const { id } = await params;
    const exhibitorId = decodeURIComponent(id);
    const repo = await getRepository();
    const graph = await repo.loadExhibitorGraph();
    if (!graph.exhibitors.some((e) => e.id === exhibitorId)) return notFound("브랜드를 찾을 수 없어요");
    const r = await enqueueBrandDrafts(repo, [exhibitorId], { actor: await getAdminActor(), reason: "관리자가 초안 만들기를 눌렀어요" });
    if (r.brands === 0) return ok({ queued: false, note: "이미 초안을 만들려고 기다리는 중이에요" });
    return created({ queued: true, jobId: r.jobIds[0] });
  });
}
