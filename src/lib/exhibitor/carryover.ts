/**
 * 이월 초안 — 순수. 이미 아는 브랜드면 지난 회차의 승인된 정보를 이번 부스 초안으로
 * 미리 채운다(설계 2026-10-02 §5).
 *
 * 브랜드(참가사)에 정보를 복사해 두지 않는다 — 연결된 부스들 중 **가장 최근 회차**의
 * 승인된 저작이 원천이다. 그래서 업데이트는 따로 하는 일이 아니다: 이번 회차에서 고쳐
 * 승인하면 그게 다음 회차의 원천이 된다.
 *
 * 행사마다 다른 것은 넘기지 않는다 — 지난 행사의 "선착순 50명 무료 티켓"을 이번 행사
 * 사실처럼 말하면 거짓말이다.
 */
import { needsDraft } from "@/lib/enrichment/draft-prompt";
import type { ExhibitorGraph } from "@/lib/types";

export interface CarryEnrichment {
  summary?: string;
  roamInterpretation?: string;
  valueTags?: { slug: string; strength: number }[];
  recommendationReasons?: Record<string, string>;
  thingsToDo?: string[];
  timing?: string[];
  memoryHooks?: string[];
}

export interface CarryBooth {
  id: string;
  exhibitionId: string;
  name: string;
  images: string[];
  logoUrl?: string;
  instagramUrl?: string;
  websiteUrl?: string;
  enrichment?: CarryEnrichment;
}

export interface CarryoverInput {
  /** 채울 회차. */
  exhibitionId: string;
  graph: Pick<ExhibitorGraph, "participants" | "assignments"> & { exhibitors: { id: string }[] };
  exhibitions: { id: string; name: string; startDate: string }[];
  booths: CarryBooth[];
  /** 이미 대기 중인 초안이 있는 부스 — 그 초안을 덮지 않는다. */
  pendingBoothIds?: Set<string>;
}

export interface CarryoverItem {
  boothId: string;
  sourceBoothId: string;
  /** "2026 마곡리빙마켓「메멜트」" — 그 회차에 표기된 이름으로(설계 §3). */
  sourceLabel: string;
  payload: Omit<CarryEnrichment, "timing">;
  /** 비어 있는 사진·로고·링크만. 채워진 칸은 안 건드린다. */
  boothPatch: Partial<Pick<CarryBooth, "images" | "logoUrl" | "instagramUrl" | "websiteUrl">>;
}

/** 행사 한정 표현 — 이번 회차에 그대로 말하면 거짓이 되는 것. */
// 줄·품절·매진·오전/오후는 그 행사 현장의 상황이다 — 데코리아제과 이월에서 "오후엔 줄이
// 생겨"가 넘어왔다(서울카페쇼 2026-10-02).
const EVENT_SPECIFIC =
  /줄이\s*(생|서|길)|대기\s*줄|웨이팅|품절|매진|오전|오후|저녁|마감\s*전|선착순|무료\s*(티켓|입장|초대)|초대권|증정|추첨|경품|할인|이벤트|부스\b|[A-Z]-?\d{2}\s*부스|\(\s*[A-Z]{1,2}-?\d{1,4}\s*\)|\b[A-Z]{1,2}-\d{1,4}\b|\d{1,2}\s*월\s*\d{1,2}\s*일|\d{1,2}\/\d{1,2}|오늘|이번\s*(행사|박람회|전시)|현장\s*(한정|판매)/;

export function isEventSpecific(s: string): boolean {
  return EVENT_SPECIFIC.test(s);
}

/** 문장 단위로 행사 고유 표현을 걷는다. 한 문장 때문에 멀쩡한 앞 문장까지 버리지 않는다
 *  ("디저트를 만드는 곳이야. 맛보고 사 가는 부스라 오후엔 줄이 생겨." → 앞 문장만). */
export function stripEventSpecific(text?: string): string | undefined {
  if (!text) return undefined;
  const kept = text
    .split(/(?<=[.!?。])\s+/)
    .filter((s) => s.trim() && !isEventSpecific(s));
  const out = kept.join(" ").trim();
  return out || undefined;
}

export function planCarryover(input: CarryoverInput): CarryoverItem[] {
  const startOf = new Map(input.exhibitions.map((e) => [e.id, e.startDate]));
  const nameOf = new Map(input.exhibitions.map((e) => [e.id, e.name]));
  const boothById = new Map(input.booths.map((b) => [b.id, b]));
  const participant = new Map(input.graph.participants.map((p) => [p.id, p]));
  // 부스 → (참가사, 그 회차 표기 이름)
  const ownerOf = new Map<string, { exhibitorId: string; displayName: string }>();
  for (const a of input.graph.assignments) {
    if (a.role !== "primary") continue;
    const p = participant.get(a.participantId);
    if (p) ownerOf.set(a.boothId, { exhibitorId: p.exhibitorId, displayName: p.displayName });
  }
  const boothsOf = new Map<string, string[]>();
  for (const [boothId, o] of ownerOf) {
    if (!boothsOf.has(o.exhibitorId)) boothsOf.set(o.exhibitorId, []);
    boothsOf.get(o.exhibitorId)!.push(boothId);
  }

  const out: CarryoverItem[] = [];
  for (const target of input.booths) {
    if (target.exhibitionId !== input.exhibitionId) continue;
    if (!needsDraft(target.enrichment)) continue;
    if (input.pendingBoothIds?.has(target.id)) continue;
    const owner = ownerOf.get(target.id);
    if (!owner) continue;
    // 다른 회차의, 핵심이 채워진 부스 중 가장 최근 회차.
    const source = (boothsOf.get(owner.exhibitorId) ?? [])
      .map((id) => boothById.get(id))
      .filter((b): b is CarryBooth => !!b && b.exhibitionId !== input.exhibitionId && !needsDraft(b.enrichment))
      .sort((a, b) => (startOf.get(b.exhibitionId) ?? "").localeCompare(startOf.get(a.exhibitionId) ?? ""))[0];
    if (!source?.enrichment) continue;

    const e = source.enrichment;
    const payload: CarryoverItem["payload"] = {};
    const summary = stripEventSpecific(e.summary);
    const line = stripEventSpecific(e.roamInterpretation);
    if (summary) payload.summary = summary;
    if (line) payload.roamInterpretation = line;
    if (e.valueTags?.length) payload.valueTags = e.valueTags;
    const reasons = Object.fromEntries(
      Object.entries(e.recommendationReasons ?? {}).filter(([, v]) => !isEventSpecific(v)),
    );
    if (Object.keys(reasons).length) payload.recommendationReasons = reasons;
    const todo = (e.thingsToDo ?? []).filter((t) => !isEventSpecific(t));
    if (todo.length) payload.thingsToDo = todo;
    if (e.memoryHooks?.length) payload.memoryHooks = e.memoryHooks;
    // 핵심 둘 중 하나도 못 넘기면 이월할 게 없다(행사 고유 표현뿐이었다).
    if (!payload.summary && !payload.roamInterpretation) continue;

    const boothPatch: CarryoverItem["boothPatch"] = {};
    if (!target.images.length && source.images.length) boothPatch.images = source.images;
    if (!target.logoUrl && source.logoUrl) boothPatch.logoUrl = source.logoUrl;
    if (!target.instagramUrl && source.instagramUrl) boothPatch.instagramUrl = source.instagramUrl;
    if (!target.websiteUrl && source.websiteUrl) boothPatch.websiteUrl = source.websiteUrl;

    const srcName = ownerOf.get(source.id)?.displayName ?? source.name;
    out.push({
      boothId: target.id,
      sourceBoothId: source.id,
      sourceLabel: `${nameOf.get(source.exhibitionId) ?? source.exhibitionId}「${srcName}」`,
      payload,
      boothPatch,
    });
  }
  return out;
}
