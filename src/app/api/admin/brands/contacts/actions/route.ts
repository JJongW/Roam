import { getAdminActor, ok, parseBody, requireAdmin, withErrorBoundary } from "@/lib/api/http";
import { getRepository } from "@/lib/repositories";
import { contactActionsInputSchema } from "@/lib/schemas";
import { planContactAction } from "@/lib/brands/contact-actions";
import { getOutreachStore, subjectsFromGraph, type LogItem, type SubjectState } from "@/lib/brands/outreach-store";
import { todayISO } from "@/lib/exhibition/current";

/**
 * 연락 보드의 한 번 누르기(상태 바꾸기, 보냄 표시, 허락 범위, 체크, 받은 연락 기록).
 * 출전 여럿에 같은 동작을 한 번에 건다(최대 300곳). 동작마다 저장하고 기록 한 줄을 남긴다 —
 * 수정만 하고 기록이 빠지지 않게 한 곳(planContactAction)에서 둘을 같이 만든다.
 * 보낸 날짜는 서울 기준 오늘, 누가는 관리자 쿠키에서. 보내기 자체는 하지 않는다.
 * 저장 자리(브랜드 연락처 + 출전 허락, 또는 옛 부스 키)는 outreach-store.ts가 고른다.
 */
export async function POST(req: Request) {
  return withErrorBoundary(req, async () => {
    const denied = await requireAdmin();
    if (denied) return denied;
    const parsed = await parseBody(req, contactActionsInputSchema);
    if (!parsed.ok) return parsed.res;
    const { targets, action } = parsed.data;
    const repo = await getRepository();
    const [actor, graph, store] = await Promise.all([getAdminActor(), repo.loadExhibitorGraph(), getOutreachStore(repo)]);
    const today = todayISO();
    const subjects = new Map(subjectsFromGraph(graph, targets.map((t) => t.participantId)).map((s) => [s.participantId, s]));
    const results: { participantId: string; state: SubjectState; log: LogItem }[] = [];
    const skipped: { participantId: string; reason: string }[] = [];
    // 차례로 — 같은 브랜드의 출전이 둘 와도 앞 결과 위에서 판단한다. 운영자 한 명이 누르는 화면이라 느려도 된다.
    for (const t of targets) {
      const subject = subjects.get(t.participantId);
      if (!subject) {
        skipped.push({ participantId: t.participantId, reason: "출전을 찾을 수 없어요" });
        continue;
      }
      const prev = (await store.read([subject])).get(subject.participantId)!;
      const plan = planContactAction(prev.view, action, { today, handle: t.handle, logs: prev.logs });
      if (!plan.ok) {
        skipped.push({ participantId: t.participantId, reason: plan.reason });
        continue;
      }
      const r = await store.apply(subject, plan, actor);
      if (!r.ok) skipped.push({ participantId: t.participantId, reason: r.reason });
      else results.push({ participantId: t.participantId, state: r.state, log: r.log });
    }
    return ok({ results, skipped, mode: store.mode });
  });
}
