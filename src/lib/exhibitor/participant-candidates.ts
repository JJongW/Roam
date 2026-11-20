/**
 * 이미 있는 참가에서 참가 단위 연결 후보를 찾는다 — 순수. DB도 네트워크도 안 탄다.
 *
 * 왜(2026-11-20 Ted): 브랜드 먼저 인입(brands.v1)은 이름만 같은 기존 브랜드를 "보여만" 줬다. 0057 후보가
 * 부스를 필수로 둬서 부스 없는 참가는 후보가 될 수 없었기 때문이다. 그래서 이미 들어간 참가(새해 준비상점
 * 250곳 등)의 이름 짝은 어디에도 쌓이지 않았다. 0073이 부스를 선택으로 풀었으니, 한 박람회의 참가를 훑어
 * 이름만 같은 다른 브랜드를 후보로 낸다. 인입(brands-plan.ts)과 같은 이름 규칙(정확히 같거나 nameKey가 같음)이다.
 *
 * 규칙
 * - 이 박람회의 참가마다: 참가 표기 이름, 참가 다른 이름, 그 브랜드의 대표 이름과 다른 이름.
 * - 다른 브랜드의 같은 이름 집합(대표 이름, 다른 이름, 회차별 표기)과 맞으면 후보. 자기 브랜드는 뺀다.
 * - 이미 낸 짝(대기, 승인, 반려, 정리됨)은 다시 내지 않는다(candidateKeys).
 * - 대표 부스가 있는 참가는 부스 연결이 이미 후보를 냈을 수 있다. 같은 짝이면 위 규칙으로 걸러진다.
 */
import type { ExhibitorGraph } from "@/lib/types";
import { nameKey } from "./identity";
import type { ExistingExhibitor, ExhibitorPlan } from "./plan";

function nameForms(name: string): string[] {
  const t = name.trim();
  const k = nameKey(t);
  return [`=${t}`, ...(k ? [`~${k}`] : [])];
}

export interface ParticipantCandidate {
  participantId: string;
  participantName: string;
  fromExhibitorId: string;
  exhibitorId: string;
  exhibitorName: string;
  matchedName: string;
  reason: string;
}

export function planParticipantNameCandidates(input: {
  exhibitionId: string;
  graph: ExhibitorGraph;
  /** lib/exhibitor/service.ts existingExhibitors — 인입과 같은 이름 집합. */
  existing: ExistingExhibitor[];
  decidedCandidates: Set<string>;
}): { candidates: ParticipantCandidate[]; exhibitorPlan: ExhibitorPlan } {
  const byName = new Map<string, Set<string>>();
  for (const e of input.existing)
    for (const n of e.names)
      for (const f of nameForms(n)) {
        if (!byName.has(f)) byName.set(f, new Set());
        byName.get(f)!.add(e.id);
      }
  const exById = new Map(input.graph.exhibitors.map((e) => [e.id, e]));
  const out: ParticipantCandidate[] = [];
  const pairs = new Set<string>(); // 같은 박람회 안 동명 브랜드끼리 A→B, B→A를 둘 다 내지 않는다
  for (const p of input.graph.participants) {
    if (p.exhibitionId !== input.exhibitionId) continue;
    const own = exById.get(p.exhibitorId);
    const names = [p.displayName, ...(p.aliases ?? []), ...(own ? [own.canonicalName, ...(own.aliases ?? [])] : [])].filter(Boolean);
    const hits = new Map<string, string>(); // exhibitorId → 맞은 이름
    for (const n of names)
      for (const f of nameForms(n))
        for (const id of byName.get(f) ?? []) if (id !== p.exhibitorId && !hits.has(id)) hits.set(id, n);
    for (const [id, matched] of hits) {
      if (input.decidedCandidates.has(`pt:${p.id}|${id}`)) continue;
      const pair = [p.exhibitorId, id].sort().join("|");
      if (pairs.has(pair)) continue;
      pairs.add(pair);
      out.push({
        participantId: p.id,
        participantName: p.displayName,
        fromExhibitorId: p.exhibitorId,
        exhibitorId: id,
        exhibitorName: exById.get(id)?.canonicalName ?? id,
        matchedName: matched,
        reason: `이름이 같아요: "${matched}"`,
      });
    }
  }
  return {
    candidates: out,
    exhibitorPlan: {
      exhibitors: [],
      participants: [],
      assignments: [],
      candidates: out.map((c) => ({ participantRef: { existing: c.participantId }, target: { existing: c.exhibitorId }, reason: c.reason })),
    },
  };
}
