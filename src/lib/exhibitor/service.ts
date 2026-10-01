import type { Repository } from "@/lib/repositories/types";
import type { Booth, ExhibitorGraph } from "@/lib/types";
import { identityKeys } from "./identity";
import { planExhibitorLinks, type ExhibitorPlan, type ExistingExhibitor } from "./plan";

/**
 * 저장소의 참가사 그래프 + 부스들로 연결 계획을 만든다. 백필과 인입이 같은 판정을
 * 쓰도록 한 곳에 둔다(같은 규칙이 두 벌 있으면 다음 사람이 한 벌만 고친다).
 */
export async function planFromRepository(
  repo: Repository,
): Promise<{ plan: ExhibitorPlan; graph: ExhibitorGraph; booths: Booth[] }> {
  const exhibitions = await repo.listExhibitions({ limit: 200 });
  // listBoothsFull — 목록 조회(listBoothsByExhibitionId)는 좁힌 컬럼이라 링크가
  // 빠질 수 있다. 신원 판정은 링크를 읽으니 전 필드 조회를 쓴다(CLAUDE.md "없음 ≠ 비어 있음").
  const [graph, ...perExhibition] = await Promise.all([
    repo.loadExhibitorGraph(),
    ...exhibitions.data.map((e) => repo.listBoothsFull(e.id)),
  ]);
  const booths = perExhibition.flat();
  const boothById = new Map(booths.map((b) => [b.id, b]));
  const exhibitorOfParticipant = new Map(graph.participants.map((p) => [p.id, p.exhibitorId]));

  // 기존 참가사의 신원 키 = 참가사 자체 링크 + 그 참가사에 배정된 모든 부스의 링크.
  const keys = new Map<string, Set<string>>();
  const names = new Map<string, Set<string>>();
  for (const e of graph.exhibitors) {
    keys.set(e.id, new Set(identityKeys(e)));
    names.set(e.id, new Set([e.canonicalName]));
  }
  for (const p of graph.participants) names.get(p.exhibitorId)?.add(p.displayName);
  for (const a of graph.assignments) {
    const ex = exhibitorOfParticipant.get(a.participantId);
    const b = boothById.get(a.boothId);
    if (ex && b) for (const k of identityKeys(b)) keys.get(ex)?.add(k);
  }
  const exhibitors: ExistingExhibitor[] = graph.exhibitors.map((e) => ({
    id: e.id,
    keys: [...(keys.get(e.id) ?? [])],
    names: [...(names.get(e.id) ?? [])],
  }));

  const plan = planExhibitorLinks({
    booths: booths.map((b) => ({
      id: b.id,
      exhibitionId: b.exhibitionId,
      name: b.name,
      kind: b.kind,
      instagramUrl: b.instagramUrl,
      websiteUrl: b.websiteUrl,
    })),
    exhibitors,
    participants: graph.participants,
    assignedBoothIds: new Set(graph.assignments.map((a) => a.boothId)),
    // 판단했든 대기 중이든 이미 낸 후보는 다시 내지 않는다.
    decidedCandidates: new Set(graph.candidates.map((c) => `${c.boothId}|${c.exhibitorId}`)),
  });
  return { plan, graph, booths };
}
