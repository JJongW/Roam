// 연결 확인 목록 — "이 참가를 이 브랜드에 이어도 될까요?" 한 줄씩. 순수 함수, I/O 없음.
//
// 판단 단위는 **참가**(그 박람회에 그 브랜드가 나온다는 사실)다. 부스는 나중에 붙는 선택값이라
// 없어도 줄이 된다(2026-11-20 Ted 결정, docs/decisions/2026-11-20_브랜드-대조는-참가-단위.md).
//
// 후보는 두 곳이 identity.ts 규칙으로 만든다: 부스 연결(lib/exhibitor/plan.ts)과 브랜드 먼저 인입
// (lib/intake/brands-plan.ts). 인스타나 웹 도메인이 겹치면 바로 잇고, 이름만 같으면
// exhibitor_link_candidate(0057, 0073)에 pending으로 쌓는다. 거절한 짝은 다시 내지 않는다.
// 여기서는 판정을 새로 하지 않고, 사람이 고르기 쉽게 근거를 나란히 보여 준다.
import { identityKeys, nameKey } from "@/lib/exhibitor/identity";
import type { Booth, Exhibition, ExhibitorGraph, ExhibitorLinkCandidate, ProfileField } from "@/lib/types";

export interface LinkSide {
  /** 출전 id. 출전으로 이어지지 않은 부스면 부스 id로 대신한다(화면 열쇠). */
  key: string;
  participantId?: string;
  /** 대표 배정 부스. 없으면 자리가 아직 정해지지 않은 참가다. */
  boothId?: string;
  exhibitionName: string;
  startDate: string;
  code?: string;
  name: string;
  /** 이 참가의 다른 이름(영문 이름 등). */
  aliases?: string[];
  instagramUrl?: string;
  websiteUrl?: string;
  summary: string;
  image?: string;
}

export interface LinkBrand {
  exhibitorId: string;
  name: string;
  aliases: string[];
  instagramUrl?: string;
  websiteUrl?: string;
}

export interface LinkRow {
  id: string;
  /** 후보를 만든 쪽이 남긴 사유 원문. */
  reason: string;
  /** 화면에 보여 줄 근거들(이름, 다른 이름, 인스타와 웹, 다른 박람회 출전, 작가명). */
  evidence: string[];
  /** 판단할 참가. 부스가 있으면 부스 정보를 쓰고, 없으면 참가 표기 이름과 브랜드 링크만. */
  subject: LinkSide | null;
  /** 이 참가가 지금 속한 브랜드(인입이 임시로 만든 것일 수 있다). 승인하면 이 브랜드가 target으로 합쳐진다. */
  from?: LinkBrand;
  fromExhibitorId?: string;
  target: LinkBrand & { artistName?: string; appearances: LinkSide[] };
  createdAt: string;
}

const igHandle = (k: string) => k.replace(/^instagram\.com\//, "");

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
  const boothOfParticipant = new Map<string, string>(); // participantId → boothId (primary)
  const participantOfBooth = new Map<string, string>(); // boothId → participantId (primary)
  for (const a of input.graph.assignments) {
    if (a.role !== "primary" || !participantById.has(a.participantId)) continue;
    if (!boothOfParticipant.has(a.participantId)) boothOfParticipant.set(a.participantId, a.boothId);
    participantOfBooth.set(a.boothId, a.participantId);
  }
  const brandOf = (id: string | undefined): LinkBrand | undefined => {
    const e = id ? exhibitorById.get(id) : undefined;
    return e
      ? { exhibitorId: e.id, name: e.canonicalName, aliases: e.aliases ?? [], instagramUrl: e.instagramUrl, websiteUrl: e.websiteUrl }
      : undefined;
  };

  const boothSide = (b: Booth, participantId?: string): LinkSide => {
    const ex = exById.get(b.exhibitionId);
    const p = participantId ? participantById.get(participantId) : undefined;
    return {
      key: participantId ?? b.id,
      participantId,
      boothId: b.id,
      exhibitionName: ex?.name ?? b.exhibitionId,
      startDate: ex?.startDate ?? "",
      code: b.code,
      name: p?.displayName || b.name,
      ...(p?.aliases?.length ? { aliases: p.aliases } : {}),
      instagramUrl: b.instagramUrl || undefined,
      websiteUrl: b.websiteUrl || undefined,
      summary: b.enrichment?.summary || b.description || "",
      image: b.images?.[0] ?? b.logoUrl,
    };
  };
  /** 참가 하나. 대표 부스가 있으면 부스 정보를, 없으면(브랜드 먼저 인입) 표기 이름과 브랜드 링크만. */
  const participantSide = (participantId: string): LinkSide | null => {
    const p = participantById.get(participantId);
    if (!p) return null;
    const boothId = boothOfParticipant.get(p.id);
    const b = boothId ? boothById.get(boothId) : undefined;
    if (b) return boothSide(b, p.id);
    const ex = exById.get(p.exhibitionId);
    const brand = exhibitorById.get(p.exhibitorId);
    return {
      key: p.id,
      participantId: p.id,
      exhibitionName: ex?.name ?? p.exhibitionId,
      startDate: ex?.startDate ?? "",
      name: p.displayName,
      ...(p.aliases?.length ? { aliases: p.aliases } : {}),
      instagramUrl: brand?.instagramUrl,
      websiteUrl: brand?.websiteUrl,
      summary: "",
    };
  };

  return input.candidates.map((c) => {
    // 판단할 참가: 후보의 participantId가 먼저, 옛 행이면 부스의 대표 배정.
    const participantId = c.participantId ?? (c.boothId ? participantOfBooth.get(c.boothId) : undefined);
    const booth = c.boothId ? boothById.get(c.boothId) : undefined;
    const subject = participantId ? participantSide(participantId) : booth ? boothSide(booth) : null;
    const fromExhibitorId = participantId ? participantById.get(participantId)?.exhibitorId : undefined;
    const from = brandOf(fromExhibitorId);

    const t = exhibitorById.get(c.exhibitorId);
    const targetParticipants = input.graph.participants.filter((p) => p.exhibitorId === c.exhibitorId);
    const appearances = targetParticipants
      .map((p) => participantSide(p.id))
      .filter((s): s is LinkSide => !!s)
      .sort((x, y) => y.startDate.localeCompare(x.startDate));

    const evidence: string[] = [];
    // 이름 — 이 참가(표기 이름, 다른 이름)와 지금 브랜드 이름 / 대상 브랜드의 대표 이름, 다른 이름, 회차별 표기.
    const mineNames = [subject?.name, ...(subject?.aliases ?? []), from?.name, ...(from?.aliases ?? [])].filter((n): n is string => !!n);
    const theirNames = [
      t?.canonicalName ?? "",
      ...(t?.aliases ?? []),
      ...targetParticipants.flatMap((p) => [p.displayName, ...(p.aliases ?? [])]),
    ].filter(Boolean);
    const seenPair = new Set<string>();
    for (const n of mineNames) {
      const k = nameKey(n);
      const hit = k ? theirNames.find((x) => nameKey(x) === k) : undefined;
      if (!hit || seenPair.has(k!)) continue;
      seenPair.add(k!);
      evidence.push(n === hit ? `이름이 같아요: ${n}` : `이름이 같아요: ${n} = ${hit}`);
    }
    const mineAliases = [...new Set([...(subject?.aliases ?? []), ...(from?.aliases ?? [])])].filter((a) => a !== subject?.name);
    if (mineAliases.length) evidence.push(`이 참가의 다른 이름: ${mineAliases.join(", ")}`);
    if (t?.aliases?.length) evidence.push(`브랜드의 다른 이름: ${t.aliases.join(", ")}`);

    // 인스타와 웹 — 이 참가의 부스와 지금 브랜드 / 대상 브랜드와 그 부스들.
    const mine = new Set([...(subject ? identityKeys(subject) : []), ...(from ? identityKeys(from) : [])]);
    const theirBooths = targetParticipants
      .map((p) => boothOfParticipant.get(p.id))
      .map((id) => (id ? boothById.get(id) : undefined))
      .filter((x): x is Booth => !!x);
    const theirs = new Set([...theirBooths.flatMap((b) => identityKeys(b)), ...(t ? identityKeys(t) : [])]);
    const shared = [...mine].filter((k) => theirs.has(k));
    for (const k of shared) evidence.push(k.includes("instagram.com") ? `인스타 계정이 같아요: ${igHandle(k)}` : `웹 주소가 같아요: ${k}`);
    const ig = (s: Set<string>) => [...s].filter((k) => k.startsWith("instagram.com/"));
    if (!shared.length && ig(mine).length && ig(theirs).length)
      evidence.push(`인스타가 달라요: ${ig(mine).map(igHandle).join(", ")} / ${ig(theirs).map(igHandle).join(", ")}`);
    if (mine.size === 0) evidence.push("이 참가에는 인스타나 웹 주소가 없어요");
    else if (theirs.size === 0) evidence.push("브랜드 쪽에는 인스타나 웹 주소가 없어요");

    // 다른 박람회 출전 — 이 참가의 박람회는 뺀다.
    const thisFair = participantId ? participantById.get(participantId)?.exhibitionId : booth?.exhibitionId;
    const otherFairs = [
      ...new Set(targetParticipants.filter((p) => p.exhibitionId !== thisFair).map((p) => exById.get(p.exhibitionId)?.name ?? p.exhibitionId)),
    ];
    if (otherFairs.length) evidence.push(`브랜드가 나온 박람회: ${otherFairs.join(", ")}`);

    const a1 = fromExhibitorId ? artistOf.get(fromExhibitorId) : undefined;
    const a2 = artistOf.get(c.exhibitorId);
    if (a1 && a2) evidence.push(a1 === a2 ? `작가명이 같아요: ${a1}` : `작가명이 달라요: ${a1}, ${a2}`);

    return {
      id: c.id,
      reason: c.reason,
      evidence,
      subject,
      ...(from ? { from } : {}),
      fromExhibitorId,
      target: {
        ...(brandOf(c.exhibitorId) ?? { exhibitorId: c.exhibitorId, name: c.exhibitorId, aliases: [] }),
        artistName: a2,
        appearances,
      },
      createdAt: c.createdAt,
    };
  });
}
