// 틀 글쓴이 — 확인된 사실만 정해진 문장에 채운다. 순수, LLM 없음.
//
// LLM 글쓴이가 없거나 게이트를 못 넘으면 이 판본을 쓴다. 문장이 단단한 대신 담백하다.
// 화자는 Roam(에디터)이다. 로미가 아니라서 "제가"를 쓰지 않고, 추천하거나 취향을 아는 척하지 않는다
// (00_brand-rules §5, 02_voice-tone §7-1, 메모 romi-companion-not-recommender).
import type { ArticleBlock, ArticleKind, ArticlePhoto, ArticleSource } from "@/lib/types";
import {
  brandSources,
  exhibitionSource,
  indexFields,
  introParticipation,
  permittedPhotos,
  sourceIdOf,
  uniqueSources,
  type BrandFacts,
  type Participation,
} from "./facts";
import { josa, koreanDateRange } from "./korean";
import { leadQuote, type Candidate } from "./select";
import type { ProfileField } from "@/lib/types";

/** 저장 전 판본. 게이트가 이걸 본다. */
export interface Draft {
  kind: ArticleKind;
  subjectKey: string;
  title: string;
  excerpt: string;
  /** 대표 사진. 허락 받은 사진이 없으면 후보가 되지 않으므로 늘 있다. */
  hero: ArticlePhoto;
  body: ArticleBlock[];
  sources: ArticleSource[];
  /** 고유명사(브랜드, 행사, 장소, 부스 번호, 품목). 게이트가 말투 검사에서 가린다. */
  protectedTerms: string[];
  exhibitorIds: string[];
  exhibitionIds: string[];
  writer: string;
  /** Roam이 글 안에서 센 수(게이트가 출처 숫자로 인정). */
  derivedNumbers?: number[];
}

/** 이름 뒤 조사. 받침을 모르는 이름(영문 끝)은 "브랜드"를 붙여 조사를 고른다. */
function named(name: string, kind: Parameters<typeof josa>[1]): string {
  return josa(name, kind) ?? josa(`${name} 브랜드`, kind)!;
}

function list(xs: string[]): string {
  return xs.join(", ");
}

function fairLine(p: Participation): { text: string; sourceIds: string[] } {
  const e = p.exhibition;
  const venue = e.venue ? ` ${e.venue}에서` : "";
  return {
    text: `${named(e.name, "topic")} ${koreanDateRange(e.startDate, e.endDate)}${venue} 열려요.`,
    sourceIds: [sourceIdOf.exhibition(e.id)],
  };
}

export function composeBrandIntro(c: Extract<Candidate, { kind: "brand_intro" }>, fields: ProfileField[]): Draft {
  const b = c.brand;
  const byId = indexFields(fields);
  const up = b.participations.filter((p) => p.upcoming);
  const past = b.participations.filter((p) => !p.upcoming);
  const next = up[0];
  const body: ArticleBlock[] = [];
  // 사진: 고른 회차(introParticipation)에 허락 받은 것만. 첫 장이 대표 사진, 그다음 두 장까지 본문에.
  const photos = permittedPhotos(b, introParticipation(b)?.participantId);
  if (!photos.length) throw new Error(`${b.exhibitorId}: 허락 받은 사진이 없어요`);
  const [hero, ...more] = photos;
  const inline = more.slice(0, 2);

  // 1. 어디서 만날 수 있는 브랜드인가(참가 사실).
  const lead: string[] = [];
  const leadIds: string[] = [];
  if (up.length) {
    lead.push(`${named(b.name, "topic")} ${list(up.map((p) => p.exhibition.name))}에 참가하는 브랜드예요.`);
    leadIds.push(...up.map((p) => sourceIdOf.participation(p.participantId)));
    if (past.length) {
      lead.push(`앞서 ${list(past.map((p) => p.exhibition.name))}에도 참가했어요.`);
      leadIds.push(...past.map((p) => sourceIdOf.participation(p.participantId)));
    }
  } else {
    lead.push(`${named(b.name, "topic")} ${list(past.map((p) => p.exhibition.name))}에 참가했던 브랜드예요.`);
    leadIds.push(...past.map((p) => sourceIdOf.participation(p.participantId)));
  }
  body.push({ type: "text", text: lead.join(" "), sourceIds: leadIds });

  if (next) {
    const f = fairLine(next);
    const booth = next.boothCode && next.boothId ? ` ${next.exhibition.name}에서는 ${next.boothCode} 부스에 있어요.` : "";
    body.push({
      type: "text",
      text: f.text + booth,
      sourceIds: [...f.sourceIds, ...(next.boothId && next.boothCode ? [sourceIdOf.booth(next.boothId)] : [])],
    });
  }

  // 2. 브랜드가 직접 쓴 소개. 고치지 않고 그대로 인용한다.
  if (b.intro) body.push({ type: "quote", text: b.intro.original, sourceId: b.intro.sourceId, attribution: `${b.name} 공식 소개 원문` });
  if (inline.length === 1) body.push({ type: "photo", photo: inline[0] });
  if (inline.length > 1) body.push({ type: "photo-group", photos: inline });
  if (b.whyMake) body.push({ type: "quote", text: b.whyMake.original, sourceId: b.whyMake.sourceId, attribution: `${b.name} 작가의 답` });

  // 3. 확인된 칸.
  const facts: { text: string; id: string }[] = [];
  if (b.items) facts.push({ text: `확인된 품목은 ${named(list(b.items.values), "copula")}.`, id: b.items.sourceId });
  if (b.signatureWorks)
    facts.push({ text: `${list(b.signatureWorks.values)} 같은 작업이 대표작으로 정리돼 있어요.`, id: b.signatureWorks.sourceId });
  if (b.priceRange)
    facts.push({
      text: `가격대는 ${b.priceRange.min.toLocaleString("ko-KR")}원부터 ${b.priceRange.max.toLocaleString("ko-KR")}원까지예요.`,
      id: b.priceRange.sourceId,
    });
  const link = linkLine(b);
  if (link && b.links) facts.push({ text: link, id: b.links.sourceId });
  if (facts.length) body.push({ type: "text", text: facts.map((f) => f.text).join(" "), sourceIds: facts.map((f) => f.id) });

  const sources = uniqueSources([
    ...brandSources(b, byId),
    ...b.participations.map((p) => exhibitionSource(p.exhibition)),
  ]);
  const titleFair = next ?? b.participations.at(-1)!;
  const excerpt = excerptOf(body);
  return {
    kind: "brand_intro",
    subjectKey: c.subjectKey,
    title: next ? `${next.exhibition.name}에서 만나는 ${b.name}` : `${titleFair.exhibition.name}에 참가했던 ${b.name}`,
    excerpt,
    hero,
    body,
    sources,
    protectedTerms: protectedTerms([b]),
    exhibitorIds: [b.exhibitorId],
    exhibitionIds: [...new Set(b.participations.map((p) => p.exhibitionId))],
    writer: "template",
  };
}

/** 인스타 계정이나 사이트 주소 한 줄. 출처 글(links 칸)에 주소가 그대로 있어 게이트가 대조한다. */
function linkLine(b: BrandFacts): string | null {
  const ig = b.links?.values.find((l) => l.kind === "instagram");
  const handle = ig?.url.match(/instagram\.com\/([A-Za-z0-9._]+)/)?.[1];
  if (handle) return `인스타그램 @${handle}에서 다른 작업을 볼 수 있어요.`;
  const site = b.links?.values.find((l) => l.kind === "site" || l.kind === "store");
  const host = site ? site.url.replace(/^https?:\/\//, "").replace(/\/$/, "") : null;
  return host ? `공식 사이트 ${host}에서 다른 작업을 볼 수 있어요.` : null;
}

export function composeFairRoundup(c: Extract<Candidate, { kind: "fair_roundup" }>, fields: ProfileField[]): Draft {
  const e = c.exhibition;
  const byId = indexFields(fields);
  // Roam에 등록된 수는 행사 전체 참가 수가 아니다(명단 일부만 들어온 행사가 많다). 공식 전체 수는
  // 행사 행(exhibition)에 없으니 수를 말하지 않는다. 공식 수가 행사 데이터에 생기면 그때 출처와 함께 쓴다.
  const exSource = exhibitionSource(e);
  const body: ArticleBlock[] = [];
  const venue = e.venue ? ` ${e.venue}에서` : "";
  body.push({
    type: "text",
    text: `${named(e.name, "topic")} ${koreanDateRange(e.startDate, e.endDate)}${venue} 열려요.`,
    sourceIds: [exSource.id],
  });
  body.push({
    type: "text",
    text: `참가 브랜드 가운데 ${c.brands.length}곳을 브랜드가 직접 쓴 소개와 함께 모았어요.`,
    sourceIds: [exSource.id, ...c.brands.map((b) => b.intro!.sourceId)],
  });

  // 이 박람회만의 내용(메모 fair-content-must-be-fair-specific): 품목이 확인된 곳이 셋 이상이면 많이 나온 품목.
  const withItems = c.brands.filter((b) => b.items);
  if (withItems.length >= 3) {
    const count = new Map<string, number>();
    for (const b of withItems) for (const it of new Set(b.items!.values)) count.set(it, (count.get(it) ?? 0) + 1);
    const top = [...count.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 3).map(([k]) => k);
    body.push({
      type: "text",
      text: `품목이 확인된 ${withItems.length}곳에서 많이 나온 품목은 ${list(top)} 순이에요.`,
      sourceIds: withItems.map((b) => b.items!.sourceId),
    });
  }

  // 브랜드마다 카드 하나(이름, 부스, 품목, 사진)와 소개 원문 첫 문장. 사진 없는 브랜드는 select가 이미 뺐다.
  let hero: ArticlePhoto | undefined;
  for (const b of c.brands) {
    const p = b.participations.find((x) => x.exhibitionId === e.id);
    const photos = permittedPhotos(b, p?.participantId);
    if (!p || !photos.length) throw new Error(`${b.exhibitorId}: ${e.id} 회차에 허락 받은 사진이 없어요`);
    // 대표 사진은 첫 브랜드의 둘째 장(카드와 같은 사진이 두 번 나오지 않게), 한 장뿐이면 그 장.
    hero ??= photos[1] ?? photos[0];
    const ids = [sourceIdOf.participation(p.participantId)];
    if (p.boothCode && p.boothId) ids.push(sourceIdOf.booth(p.boothId));
    if (b.items) ids.push(b.items.sourceId);
    body.push({
      type: "brand-card",
      exhibitorId: b.exhibitorId,
      name: b.name,
      ...(p.boothCode && p.boothId ? { boothCode: p.boothCode, boothId: p.boothId } : {}),
      ...(b.items ? { items: b.items.values } : {}),
      photo: photos[0],
      // 앱 M-A는 브랜드마다 사진을 옆으로 넘긴다. 너무 길어지지 않게 다섯 장까지.
      photos: photos.slice(0, CARD_PHOTOS_MAX),
      // Roam 한 줄: 확인된 품목만 말한다. 인용과 같은 말을 되풀이하지 않고, 없는 사실을 지어내지 않는다.
      ...(b.items ? { note: `확인된 품목은 ${named(list(b.items.values), "copula")}.` } : {}),
      sourceIds: ids,
    });
    body.push({ type: "quote", text: leadQuote(b.intro!.original)!, sourceId: b.intro!.sourceId, attribution: `${b.name} 공식 소개 원문에서` });
  }
  if (!hero) throw new Error(`${e.id}: 대표 사진이 없어요`);

  const sources = uniqueSources([exSource, ...c.brands.flatMap((b) => brandSources(b, byId))]);
  return {
    kind: "fair_roundup",
    subjectKey: c.subjectKey,
    // "참가 브랜드 5곳"은 다섯 곳만 나오는 것처럼 읽힌다. 고른 일부라는 걸 제목에서 밝힌다.
    title: `${e.name} 참가 브랜드 중 ${c.brands.length}곳`,
    excerpt: excerptOf(body),
    hero,
    body,
    sources,
    protectedTerms: [...protectedTerms(c.brands), e.name, e.venue].filter(Boolean),
    exhibitorIds: c.brands.map((b) => b.exhibitorId),
    exhibitionIds: [e.id],
    writer: "template",
    derivedNumbers: [c.brands.length, withItems.length],
  };
}

/** 모음 글 브랜드 카드 하나에 싣는 사진 수 상한. */
export const CARD_PHOTOS_MAX = 5;

/** 미리보기 글: 앞 문단을 300자 안에서 두 개까지. 슬랙에서 두세 줄로 읽힌다. */
export const EXCERPT_MAX = 300;
export function excerptOf(body: ArticleBlock[]): string {
  const out: string[] = [];
  for (const b of body) {
    if (b.type !== "text") continue;
    if (out.length === 2 || [...out, b.text].join(" ").length > EXCERPT_MAX) break;
    out.push(b.text);
  }
  return out.join(" ") || ((body.find((b) => b.type === "text") as { text: string } | undefined)?.text.slice(0, EXCERPT_MAX) ?? "");
}

export function protectedTerms(brands: BrandFacts[]): string[] {
  const out: string[] = [];
  for (const b of brands) {
    out.push(...b.names);
    for (const p of b.participations) out.push(p.exhibition.name, p.exhibition.venue, p.displayName, ...(p.boothCode ? [p.boothCode] : []));
    if (b.items) out.push(...b.items.values);
    if (b.signatureWorks) out.push(...b.signatureWorks.values);
  }
  return [...new Set(out.map((x) => x.trim()).filter(Boolean))];
}

export function composeTemplate(c: Candidate, fields: ProfileField[]): Draft {
  return c.kind === "brand_intro" ? composeBrandIntro(c, fields) : composeFairRoundup(c, fields);
}
