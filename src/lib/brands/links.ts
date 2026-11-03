// 연결 확인 목록 — "이 출전을 이 브랜드에 이어도 될까요?" 한 줄씩. 순수 함수, I/O 없음.
//
// 후보는 lib/exhibitor/plan.ts(백필)가 identity.ts 규칙으로 만든다: 인스타나 웹 도메인이
// 겹치면 바로 잇고, 이름만 같으면 exhibitor_link_candidate(0057)에 pending으로 쌓는다.
// 거절(rejected)한 짝은 다음 백필이 decidedCandidates로 걸러 다시 내지 않는다.
// 여기서는 판정을 새로 하지 않고, 사람이 고르기 쉽게 근거를 나란히 보여 준다.
import { identityKeys, nameKey } from "@/lib/exhibitor/identity";
import type { Booth, Exhibition, ExhibitorGraph, ExhibitorLinkCandidate, ProfileField } from "@/lib/types";

export interface LinkSide {
  boothId: string;
  exhibitionName: string;
  startDate: string;
  code?: string;
  name: string;
  instagramUrl?: string;
  websiteUrl?: string;
  summary: string;
  image?: string;
}

export interface LinkRow {
  id: string;
  /** 백필이 남긴 사유 원문. */
  reason: string;
  /** 화면에 보여 줄 근거들(겹친 것). */
  evidence: string[];
  booth: LinkSide | null;
  /** 이 부스가 지금 속한 브랜드(백필이 임시로 만든 것일 수 있다). */
  fromExhibitorId?: string;
  target: { exhibitorId: string; name: string; artistName?: string; appearances: LinkSide[] };
  createdAt: string;
}

export function buildLinkRows(input: {
  candidates: ExhibitorLinkCandidate[];
  graph: ExhibitorGraph;
  booths: Booth[];
  exhibitions: Exhibition[];
  fields: ProfileField[];
}): LinkRow[] {
  const exById = new Map(input.exhibitions.map((e) => [e.id, e]));
  const boothById = new Map(input.booths.map((b) => [b.id, b]));
  const participantById = new Map(input.graph.participants.map((p) => [p.id, p]));
  const exhibitorById = new Map(input.graph.exhibitors.map((e) => [e.id, e]));
  const artistOf = new Map(
    input.fields
      .filter((f) => f.exhibitorId && f.field === "artistName" && typeof f.value === "string")
      .map((f) => [f.exhibitorId!, f.value as string]),
  );
  const ownerOf = new Map<string, string>(); // boothId → exhibitorId (primary)
  const boothsOf = new Map<string, string[]>(); // exhibitorId → boothIds
  for (const a of input.graph.assignments) {
    if (a.role !== "primary") continue;
    const p = participantById.get(a.participantId);
    if (!p) continue;
    ownerOf.set(a.boothId, p.exhibitorId);
    boothsOf.set(p.exhibitorId, [...(boothsOf.get(p.exhibitorId) ?? []), a.boothId]);
  }

  const side = (b: Booth | undefined): LinkSide | null => {
    if (!b) return null;
    const ex = exById.get(b.exhibitionId);
    return {
      boothId: b.id,
      exhibitionName: ex?.name ?? b.exhibitionId,
      startDate: ex?.startDate ?? "",
      code: b.code,
      name: b.name,
      instagramUrl: b.instagramUrl || undefined,
      websiteUrl: b.websiteUrl || undefined,
      summary: b.enrichment?.summary || b.description || "",
      image: b.images?.[0] ?? b.logoUrl,
    };
  };

  return input.candidates.map((c) => {
    const b = boothById.get(c.boothId);
    const target = exhibitorById.get(c.exhibitorId);
    const targetBooths = (boothsOf.get(c.exhibitorId) ?? []).map((id) => boothById.get(id)).filter((x): x is Booth => !!x);
    const fromExhibitorId = ownerOf.get(c.boothId);
    const evidence: string[] = [];
    if (b) {
      const nk = nameKey(b.name);
      const targetNames = [target?.canonicalName ?? "", ...input.graph.participants.filter((p) => p.exhibitorId === c.exhibitorId).map((p) => p.displayName)];
      const hit = targetNames.find((n) => nk && nameKey(n) === nk);
      if (hit) evidence.push(`이름이 같아요: ${b.name} = ${hit}`);
      const mine = new Set(identityKeys(b));
      const theirs = targetBooths.flatMap((t) => identityKeys(t)).concat(target ? identityKeys(target) : []);
      for (const k of new Set(theirs.filter((k) => mine.has(k))))
        evidence.push(k.includes("instagram.com") ? `인스타 계정이 같아요: ${k}` : `웹 주소가 같아요: ${k}`);
      if (!b.instagramUrl && !b.websiteUrl) evidence.push("이 출전에는 인스타나 웹 주소가 없어요");
    }
    const a1 = fromExhibitorId ? artistOf.get(fromExhibitorId) : undefined;
    const a2 = artistOf.get(c.exhibitorId);
    if (a1 && a2) evidence.push(a1 === a2 ? `작가명이 같아요: ${a1}` : `작가명이 달라요: ${a1}, ${a2}`);
    return {
      id: c.id,
      reason: c.reason,
      evidence,
      booth: side(b),
      fromExhibitorId,
      target: {
        exhibitorId: c.exhibitorId,
        name: target?.canonicalName ?? c.exhibitorId,
        artistName: a2,
        appearances: targetBooths
          .map(side)
          .filter((s): s is LinkSide => !!s)
          .sort((x, y) => y.startDate.localeCompare(x.startDate)),
      },
      createdAt: c.createdAt,
    };
  });
}
