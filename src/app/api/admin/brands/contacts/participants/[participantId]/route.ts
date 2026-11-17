import { notFound, ok, requireAdmin, withErrorBoundary } from "@/lib/api/http";
import { getRepository } from "@/lib/repositories";
import { getOutreachStore, subjectsFromGraph } from "@/lib/brands/outreach-store";

type Ctx = { params: Promise<{ participantId: string }> };

/** 출전 하나의 연락(브랜드 연락처 + 이 회차 허락)과 기록. 저장한 적 없으면 빈 값을 준다. */
export async function GET(req: Request, { params }: Ctx) {
  return withErrorBoundary(req, async () => {
    const denied = await requireAdmin();
    if (denied) return denied;
    const { participantId } = await params;
    const repo = await getRepository();
    const [graph, store] = await Promise.all([repo.loadExhibitorGraph(), getOutreachStore(repo)]);
    const [subject] = subjectsFromGraph(graph, [participantId]);
    if (!subject) return notFound("출전을 찾을 수 없어요");
    const state = (await store.read([subject])).get(participantId)!;
    return ok({ ...state, mode: store.mode });
  });
}
