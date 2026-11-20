// 아티클이 쓸 수 있는 사실만 모은다. 순수, LLM 없음.
//
// 규칙(브랜드 규칙 §2, §5, 메모 card-news-copy-style, generated-review-allowed):
// - 사실은 확인된 칸(collected, reviewed, artist_confirmed)과 행사 행, 참가 사실, 부스에서만 온다.
//   AI 초안(ai_draft)과 다시 볼 것(stale)은 읽지 않는다.
// - 브랜드나 주최 측이 쓴 소개 원문은 고치지 않는다. 인용으로만 쓴다(§1 2026-11-09).
// - 모든 사실은 출처 id를 갖는다. 본문 문장은 이 id로 사실을 가리키고, 게이트가 대조한다.
import { CONFIRMED_FIELD_STATUSES, profileFieldId } from "@/lib/brands/profile";
import { OFFICIAL_DOT_NAMES } from "@/lib/booth/roam-voice";
import type { ArticlePhoto, ArticleSource, BrandContactStatus, Exhibition, ExhibitorGraph, ProfileField } from "@/lib/types";

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
  /** 이 회차의 사진 허락(허락 또는 일부 허락 + 사진 토큰일 때만). */
  photoGrant?: { sourceId: string; status: BrandContactStatus; allowedUse: string[] };
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
  /** 사람이 허락 범위를 붙이고 확인한 대표 사진(앱에서 열리는 경로만). 회차 허락과 짝지어야 쓸 수 있다. */
  photoField?: { sourceId: string; items: { path: string; scope: string }[] };
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
  /** 참가(participant) id → 그 회차 연락 상태와 허락 범위. 없으면 사진 허락이 없는 것. */
  permissions?: Record<string, { status: BrandContactStatus; allowedUse: string[] }>;
}

// --- 사진 허락 ----------------------------------------------------------------
// 2026-11-19 Ted "아티클에 사진은 당연하게 넣어야 하고". 쓸 수 있는 사진은 둘 다 맞을 때만이다.
// 1. 대표 사진 칸(brand_profile_field photos)을 사람이 확인했다(reviewed, artist_confirmed).
//    이 칸은 "작가 허락 범위와 함께 사람이 넣어요"(profile.ts)인데, 명단 가져오기(brands.v1)가
//    collected로 채운 주최 측 공개 사진은 작가 허락이 아니라 쓰지 않는다.
// 2. 그 박람회 회차에 사진 허락이 있다(연락 상태 granted나 partial, 허락 범위에 account-photo나 sent-photo).
//    "허락은 박람회마다 따로 받아요"(Roam-design brand-profile-spec §4).
// 긁어 온 사진, 허락 없는 사진은 어떤 경우에도 넣지 않는다. 경로는 앱에서 열리는 것만("/…", https).

export const PHOTO_FIELD_STATUSES: readonly ProfileField["status"][] = ["reviewed", "artist_confirmed"];
export const PHOTO_GRANT_STATUSES: readonly BrandContactStatus[] = ["granted", "partial"];
export const PHOTO_USE_TOKENS = ["account-photo", "sent-photo"] as const;

export const isServablePhotoPath = (p: string) => /^(\/(?!\/)\S+|https:\/\/\S+)$/.test(p.trim());

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
  photo: (f: Pick<ProfileField, "id">) => `photo:${f.id}`,
  permission: (participantId: string) => `perm:${participantId}`,
};

function photoGrantOf(world: World, participantId: string): Pick<Participation, "photoGrant"> {
  const p = world.permissions?.[participantId];
  if (!p || !PHOTO_GRANT_STATUSES.includes(p.status)) return {};
  const allowedUse = p.allowedUse.filter((t) => (PHOTO_USE_TOKENS as readonly string[]).includes(t));
  if (!allowedUse.length) return {};
  return { photoGrant: { sourceId: sourceIdOf.permission(participantId), status: p.status, allowedUse } };
}

/** 이 회차에 쓸 수 있는 사진. 칸 확인과 회차 허락이 둘 다 있어야 한다. 없으면 빈 배열. */
export function permittedPhotos(b: BrandFacts, participantId: string | undefined): ArticlePhoto[] {
  const p = b.participations.find((x) => x.participantId === participantId);
  if (!p?.photoGrant || !b.photoField) return [];
  const grant = p.photoGrant;
  return b.photoField.items.map((it, i) => ({
    path: it.path,
    alt: `${b.name} 사진 ${i + 1}`,
    credit: `사진 ${b.name} 제공`,
    scope: it.scope,
    sourceId: b.photoField!.sourceId,
    permissionId: grant.sourceId,
  }));
}

/** 브랜드 소개 글이 기대는 회차: 다가오는 첫 회차, 없으면 가장 최근 회차. */
export function introParticipation(b: BrandFacts): Participation | undefined {
  return b.participations.find((p) => p.upcoming) ?? b.participations.at(-1);
}

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
        ...photoGrantOf(world, p.id),
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

  const photos = byId.get(profileFieldId({ exhibitorId }, "photos"));
  const photoItems = (Array.isArray(photos?.value) ? (photos!.value as { path?: unknown; scope?: unknown }[]) : [])
    .filter((x) => typeof x.path === "string" && typeof x.scope === "string" && x.scope.trim() !== "" && isServablePhotoPath(x.path))
    .map((x) => ({ path: (x.path as string).trim(), scope: (x.scope as string).trim() }));
  if (photos && PHOTO_FIELD_STATUSES.includes(photos.status) && photoItems.length)
    out.photoField = { sourceId: sourceIdOf.photo(photos), items: photoItems };

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
  if (b.photoField) {
    const f = fields.get(b.photoField.sourceId.slice("photo:".length));
    out.push({
      id: b.photoField.sourceId,
      kind: "photo",
      label: `${b.name} 대표 사진(${f ? statusLabel(f.status) : "확인됨"})`,
      origin: f?.sources ?? [],
      // 게이트가 사진 경로를 이 줄 목록과 대조한다.
      text: b.photoField.items.map((it) => `${it.path} | ${it.scope}`).join("\n"),
    });
  }
  for (const p of b.participations) {
    if (p.photoGrant)
      out.push({
        id: p.photoGrant.sourceId,
        kind: "permission",
        label: `${b.name}의 ${p.exhibition.name} 사진 허락(${p.photoGrant.status === "granted" ? "허락" : "일부 허락"})`,
        origin: [`roam:permission/${p.participantId}`],
        text: `${p.displayName}, ${p.exhibition.name} 사진 허락: ${p.photoGrant.allowedUse.join(", ")}`,
      });
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
