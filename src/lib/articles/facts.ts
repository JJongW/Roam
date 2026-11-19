// 아티클이 쓸 수 있는 사실만 모은다. 순수, LLM 없음.
//
// 규칙(브랜드 규칙 §2, §5, 메모 card-news-copy-style, generated-review-allowed):
// - 사실은 확인된 칸(collected, reviewed, artist_confirmed)과 행사 행, 참가 사실, 부스에서만 온다.
//   AI 초안(ai_draft)과 다시 볼 것(stale)은 읽지 않는다.
// - 브랜드나 주최 측이 쓴 소개 원문은 고치지 않는다. 인용으로만 쓴다(§1 2026-11-09).
// - 모든 사실은 출처 id를 갖는다. 본문 문장은 이 id로 사실을 가리키고, 게이트가 대조한다.
import { CONFIRMED_FIELD_STATUSES, profileFieldId } from "@/lib/brands/profile";
import { OFFICIAL_DOT_NAMES } from "@/lib/booth/roam-voice";
import type { ArticleSource, Exhibition, ExhibitorGraph, ProfileField } from "@/lib/types";

export type ExhibitionLite = Pick<Exhibition, "id" | "slug" | "name" | "venue" | "startDate" | "endDate">;

export interface Participation {
  participantId: string;
  exhibitionId: string;
  exhibition: ExhibitionLite;
  /** 이번 회차 표기 이름. */
  displayName: string;
  /** 대표 배정 부스 번호(있을 때만). */
  boothCode?: string;
  boothId?: string;
  upcoming: boolean;
}

export interface BrandFacts {
  exhibitorId: string;
  /** Roam이 글에 쓰는 이름(가운뎃점 앞 이름, displayBrandName). 원래 표기는 names에. */
  name: string;
  /** 고유명사 — 게이트가 말투 검사에서 가린다. */
  names: string[];
  intro?: { sourceId: string; original: string };
  /** 작가가 직접 확인한 "왜 만드나" 원문. */
  whyMake?: { sourceId: string; original: string };
  items?: { sourceId: string; values: string[] };
  signatureWorks?: { sourceId: string; values: string[] };
  priceRange?: { sourceId: string; min: number; max: number };
  identityLine?: { sourceId: string; text: string };
  links?: { sourceId: string; values: { kind: string; url: string }[] };
  participations: Participation[];
  /** 확인된 칸 수(intro, items, ...). 고르는 순서에 쓴다. */
  confirmedCount: number;
}

export interface World {
  /** KST YYYY-MM-DD */
  today: string;
  exhibitions: ExhibitionLite[];
  graph: ExhibitorGraph;
  fields: ProfileField[];
  /** 부스 id → 번호. 필요한 행사만 채워도 된다. */
  boothCodes?: Record<string, string>;
}

const CONFIRMED = new Set<string>(CONFIRMED_FIELD_STATUSES);

/**
 * Roam이 쓰는 글의 브랜드 이름. 명단에 "고동상 · 고양이와 동그란 세상"처럼 이름과 소개말이
 * 가운뎃점으로 붙어 온 것은 앞 이름만 쓴다(§5 가운뎃점 금지, 2026-11-18 Roam이 정리한 데이터에서
 * 가운뎃점을 걷어냄). 공식 표기에 가운뎃점이 든 이름(roam-voice OFFICIAL_DOT_NAMES)은 그대로.
 */
export function displayBrandName(canonical: string): string {
  const name = canonical.trim();
  if (!name.includes("·") || OFFICIAL_DOT_NAMES.includes(name)) return name;
  return name.split("·")[0].trim() || name;
}

export const sourceIdOf = {
  field: (f: Pick<ProfileField, "id">) => `field:${f.id}`,
  exhibition: (id: string) => `exh:${id}`,
  participation: (id: string) => `pt:${id}`,
  booth: (id: string) => `booth:${id}`,
};

function confirmedField(byId: Map<string, ProfileField>, exhibitorId: string, key: string): ProfileField | undefined {
  const f = byId.get(profileFieldId({ exhibitorId }, key));
  return f && CONFIRMED.has(f.status) ? f : undefined;
}

const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim() !== "").map((x) => x.trim()) : [];

/** 브랜드 하나의 사실. 확인된 칸이 하나도 없어도 이름과 참가 사실은 나온다. */
export function brandFacts(world: World, exhibitorId: string, byId = indexFields(world.fields)): BrandFacts | null {
  const ex = world.graph.exhibitors.find((e) => e.id === exhibitorId);
  if (!ex) return null;
  const exhibitions = new Map(world.exhibitions.map((e) => [e.id, e]));
  const primaryBooth = new Map<string, string>();
  for (const a of world.graph.assignments) if (a.role === "primary") primaryBooth.set(a.participantId, a.boothId);

  const participations: Participation[] = world.graph.participants
    .filter((p) => p.exhibitorId === exhibitorId && exhibitions.has(p.exhibitionId))
    .map((p) => {
      const exhibition = exhibitions.get(p.exhibitionId)!;
      const boothId = primaryBooth.get(p.id);
      const boothCode = boothId ? world.boothCodes?.[boothId] : undefined;
      return {
        participantId: p.id,
        exhibitionId: p.exhibitionId,
        exhibition,
        displayName: p.displayName,
        ...(boothCode && boothId ? { boothCode, boothId } : {}),
        upcoming: exhibition.endDate.slice(0, 10) >= world.today,
      };
    })
    .sort((a, b) => a.exhibition.startDate.localeCompare(b.exhibition.startDate));

  const out: BrandFacts = {
    exhibitorId,
    name: displayBrandName(ex.canonicalName),
    names: [...new Set([displayBrandName(ex.canonicalName), ex.canonicalName, ...(ex.aliases ?? []), ...participations.map((p) => p.displayName)])].filter(Boolean),
    participations,
    confirmedCount: 0,
  };

  const intro = confirmedField(byId, exhibitorId, "intro");
  const original = (intro?.value as { original?: unknown } | undefined)?.original;
  if (intro && typeof original === "string" && original.trim()) out.intro = { sourceId: sourceIdOf.field(intro), original: original.trim() };

  // "왜 만드나"는 작가 말만 담는 칸이라 작가 확인일 때만(profile.ts publicValue와 같은 규칙).
  const why = byId.get(profileFieldId({ exhibitorId }, "whyMake"));
  const whyOriginal = (why?.value as { original?: unknown } | undefined)?.original;
  if (why?.status === "artist_confirmed" && typeof whyOriginal === "string" && whyOriginal.trim())
    out.whyMake = { sourceId: sourceIdOf.field(why), original: whyOriginal.trim() };

  const items = confirmedField(byId, exhibitorId, "items");
  if (items && strings(items.value).length) out.items = { sourceId: sourceIdOf.field(items), values: strings(items.value) };
  const works = confirmedField(byId, exhibitorId, "signatureWorks");
  if (works && strings(works.value).length) out.signatureWorks = { sourceId: sourceIdOf.field(works), values: strings(works.value) };
  const price = confirmedField(byId, exhibitorId, "priceRange");
  const pv = price?.value as { min?: unknown; max?: unknown } | undefined;
  if (price && typeof pv?.min === "number" && typeof pv?.max === "number")
    out.priceRange = { sourceId: sourceIdOf.field(price), min: pv.min, max: pv.max };
  const line = confirmedField(byId, exhibitorId, "identityLine");
  if (line && typeof line.value === "string" && line.value.trim()) out.identityLine = { sourceId: sourceIdOf.field(line), text: line.value.trim() };
  const links = confirmedField(byId, exhibitorId, "links");
  const lv = Array.isArray(links?.value) ? (links!.value as { kind?: unknown; url?: unknown }[]) : [];
  const linkValues = lv
    .filter((l) => typeof l.kind === "string" && typeof l.url === "string")
    .map((l) => ({ kind: l.kind as string, url: l.url as string }));
  if (links && linkValues.length) out.links = { sourceId: sourceIdOf.field(links), values: linkValues };

  out.confirmedCount = [out.intro, out.whyMake, out.items, out.signatureWorks, out.priceRange, out.identityLine, out.links].filter(Boolean).length;
  return out;
}

export function indexFields(fields: ProfileField[]): Map<string, ProfileField> {
  return new Map(fields.filter((f) => f.exhibitorId).map((f) => [f.id, f]));
}

/** 행사 행을 출처 글로. 숫자는 게이트가 대조하므로 날짜를 그대로 풀어 적는다. */
export function exhibitionSourceText(e: ExhibitionLite, participantCount?: number): string {
  const [y1, m1, d1] = e.startDate.slice(0, 10).split("-").map(Number);
  const [y2, m2, d2] = e.endDate.slice(0, 10).split("-").map(Number);
  const parts = [e.name, `${y1}년 ${m1}월 ${d1}일부터 ${y2}년 ${m2}월 ${d2}일까지`, e.venue].filter(Boolean);
  if (participantCount !== undefined) parts.push(`Roam에 등록된 참가 브랜드 ${participantCount}곳`);
  return parts.join(", ");
}

/** 브랜드 사실이 기대는 출처 목록. 본문에 쓰지 않은 출처도 넣는다(검수자가 본다). */
export function brandSources(b: BrandFacts, fields: Map<string, ProfileField>): ArticleSource[] {
  const out: ArticleSource[] = [];
  const fieldSource = (sourceId: string, label: string, text: string, brandWritten = false) => {
    const f = fields.get(sourceId.slice("field:".length));
    out.push({
      id: sourceId,
      kind: "profile_field",
      label: `${b.name} ${label}(${f ? statusLabel(f.status) : "확인됨"})`,
      origin: f?.sources ?? [],
      ...(brandWritten ? { brandWritten: true } : {}),
      text,
    });
  };
  if (b.intro) fieldSource(b.intro.sourceId, "공식 소개 원문", b.intro.original, true);
  if (b.whyMake) fieldSource(b.whyMake.sourceId, "왜 만드나(작가 답)", b.whyMake.original, true);
  if (b.items) fieldSource(b.items.sourceId, "품목", b.items.values.join(", "));
  if (b.signatureWorks) fieldSource(b.signatureWorks.sourceId, "대표 작품", b.signatureWorks.values.join(", "));
  if (b.priceRange) fieldSource(b.priceRange.sourceId, "가격대", `${b.priceRange.min}원부터 ${b.priceRange.max}원까지`);
  if (b.identityLine) fieldSource(b.identityLine.sourceId, "정체 한 줄", b.identityLine.text);
  if (b.links) fieldSource(b.links.sourceId, "링크", b.links.values.map((l) => l.url).join(" "));
  for (const p of b.participations) {
    out.push({
      id: sourceIdOf.participation(p.participantId),
      kind: "participation",
      label: `${b.name}의 ${p.exhibition.name} 참가 사실`,
      origin: [`roam:participant/${p.participantId}`],
      text: `${p.displayName}, ${p.exhibition.name} 참가`,
    });
    if (p.boothId && p.boothCode)
      out.push({
        id: sourceIdOf.booth(p.boothId),
        kind: "booth",
        label: `${p.exhibition.name} 부스 ${p.boothCode}`,
        origin: [`roam:booth/${p.boothId}`],
        text: `${p.exhibition.name} ${p.boothCode} 부스`,
      });
  }
  return out;
}

export function exhibitionSource(e: ExhibitionLite, participantCount?: number): ArticleSource {
  return {
    id: sourceIdOf.exhibition(e.id),
    kind: "exhibition",
    label: `${e.name} 행사 정보(Roam 행사 기록)`,
    origin: [`roam:exhibition/${e.slug}`],
    text: exhibitionSourceText(e, participantCount),
  };
}

function statusLabel(s: ProfileField["status"]): string {
  return { collected: "공식 자료", reviewed: "에디터 확인", artist_confirmed: "작가 확인", ai_draft: "AI 초안", stale: "다시 볼 것" }[s];
}

/** 같은 출처를 한 번만. 먼저 나온 것을 남긴다. */
export function uniqueSources(xs: ArticleSource[]): ArticleSource[] {
  const seen = new Set<string>();
  return xs.filter((s) => (seen.has(s.id) ? false : (seen.add(s.id), true)));
}
