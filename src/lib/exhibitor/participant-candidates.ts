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
 * - booths를 주면 그 참가에 배정된 부스의 이름과 별칭도 참가의 이름으로 본다(2026-11-24). 부스 연결이
 *   별칭을 못 봐서 새 브랜드에 이어 버린 부스(SDF E-27 "진주도원", 별칭 "진주 복숭아주")는 다음 인입에서
 *   기존 브랜드로 묶여 이름 판정을 다시 타지 않는다. 그 짝을 여기서 후보로 올리고 합치기는 승인이 한다.
 *   공동입점 부스(SDF H-05 "노톤&무나니스트", 별칭 노톤, 무나니스트)는 별칭을 보지 않는다. 별칭이 자기 브랜드
 *   이름과 같거나 별칭들이 다른 브랜드 둘 이상에 맞으면 한 자리를 나눠 쓰는 다른 브랜드들이다. 승인하면
 *   두 브랜드가 합쳐지므로 후보로도 내지 않는다(plan.ts sameFairMatch의 "두 브랜드에 맞으면 고르지 않는다"와 같은 뜻).
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
  /** 배정된 부스의 이름과 별칭을 참가 이름에 더할 때. 없으면 참가와 브랜드 이름만 본다. */
  booths?: { id: string; name: string; aliases?: string[] }[];
}): { candidates: ParticipantCandidate[]; exhibitorPlan: ExhibitorPlan } {
  const byName = new Map<string, Set<string>>();
  for (const e of input.existing)
    for (const n of e.names)
      for (const f of nameForms(n)) {
        if (!byName.has(f)) byName.set(f, new Set());
        byName.get(f)!.add(e.id);
      }
  const exById = new Map(input.graph.exhibitors.map((e) => [e.id, e]));
  const boothById = new Map((input.booths ?? []).map((b) => [b.id, b]));
  const exhibitorOfParticipant = new Map(input.graph.participants.map((p) => [p.id, p.exhibitorId]));
  const brandsNamed = (names: string[]) => {
    const out = new Set<string>();
    for (const n of names) for (const f of nameForms(n)) for (const id of byName.get(f) ?? []) out.add(id);
    return out;
  };
  const boothNames = new Map<string, string[]>(); // participantId → 배정 부스 이름과 (공동입점이 아닌) 별칭
  for (const a of input.graph.assignments) {
    const b = boothById.get(a.boothId);
    const own = exhibitorOfParticipant.get(a.participantId);
    if (!b || !own) continue;
    const list = boothNames.get(a.participantId) ?? [];
    list.push(b.name);
    const aliasBrands = brandsNamed(b.aliases ?? []);
    const others = [...aliasBrands].filter((id) => id !== own);
    if (!aliasBrands.has(own) && others.length <= 1) list.push(...(b.aliases ?? []));
    boothNames.set(a.participantId, list);
  }
  const out: ParticipantCandidate[] = [];
  const pairs = new Set<string>(); // 같은 박람회 안 동명 브랜드끼리 A→B, B→A를 둘 다 내지 않는다
  for (const p of input.graph.participants) {
    if (p.exhibitionId !== input.exhibitionId) continue;
    const own = exById.get(p.exhibitorId);
    const names = [
      p.displayName,
      ...(p.aliases ?? []),
      ...(own ? [own.canonicalName, ...(own.aliases ?? [])] : []),
      ...(boothNames.get(p.id) ?? []),
    ].filter(Boolean);
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
