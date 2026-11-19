// 오늘 쓸 주제를 고른다. 순수, LLM 없음("서비스가 판단, LLM은 말만").
//
// - 하루 한 편. 종류는 돌아가며: 지난 편이 브랜드 소개였으면 박람회 모음을 먼저 본다.
//   고를 게 없으면 다른 종류로 넘어간다.
// - 이미 다룬 주제(초안, 승인, 반려 모두)는 다시 고르지 않는다. 반려한 주제를 피하는 것도 이 규칙이다.
// - 사실이 넉넉한 주제만: 브랜드는 확인된 소개 원문과 참가 사실이 있어야 하고,
//   박람회는 앞으로 열리거나 열리는 중이고 소개 원문이 확인된 참가 브랜드가 셋 이상이어야 한다.
// - 사진은 필수다(2026-11-19 Ted). 브랜드 소개는 그 회차에 허락 받은 사진이 한 장 이상(대표 사진),
//   모음은 허락 받은 사진이 있는 브랜드만 담고, 그런 곳이 셋이 안 되면 그 박람회를 건너뛴다(facts.ts 사진 허락).
import type { Article, ArticleKind } from "@/lib/types";
import { brandFacts, indexFields, introParticipation, permittedPhotos, type BrandFacts, type ExhibitionLite, type World } from "./facts";

/** 소개 원문이 이보다 짧으면 한 편을 받칠 사실이 아니다. */
export const MIN_INTRO_CHARS = 40;
/** 모음 한 편에 담는 브랜드 수. */
export const ROUNDUP_SIZE = 5;
export const ROUNDUP_MIN = 3;
/** 모음에 넣는 인용 상한. 이보다 긴 첫 문장은 잘라 인용하지 않고 그 브랜드를 건너뛴다. */
export const QUOTE_MAX_CHARS = 220;

export type Candidate =
  | { kind: "brand_intro"; subjectKey: string; brand: BrandFacts }
  | { kind: "fair_roundup"; subjectKey: string; exhibition: ExhibitionLite; brands: BrandFacts[]; participantCount: number };

export const subjectKeyOf = {
  brand: (exhibitorId: string) => `brand:${exhibitorId}`,
  fair: (exhibitionId: string) => `fair:${exhibitionId}`,
};

const daysUntil = (today: string, iso: string) => (Date.parse(iso.slice(0, 10)) - Date.parse(today)) / 86_400_000;

/** 원문 첫 문장(들)을 그대로 자른 인용. 40자를 넘길 때까지 문장을 잇고, 상한을 넘으면 null. */
export function leadQuote(original: string, max = QUOTE_MAX_CHARS): string | null {
  const ends: number[] = [];
  // 줄바꿈은 그 줄이 문장으로 끝났을 때만 끝으로 본다("바라며,"에서 자르면 말이 끊긴다).
  for (const m of original.matchAll(/[.!?。](?=\s|$)|\n/g)) {
    if (m[0] !== "\n") ends.push(m.index! + 1);
    else if (/[.!?。다요"”'’)]\s*$/.test(original.slice(0, m.index!))) ends.push(m.index!);
  }
  ends.push(original.length);
  for (const end of ends) {
    const q = original.slice(0, end).trim();
    if (q.length >= MIN_INTRO_CHARS || end === original.length) return q.length > 0 && q.length <= max ? q : null;
  }
  return null;
}

function brandOrder(today: string) {
  return (a: BrandFacts, b: BrandFacts) => {
    const up = (x: BrandFacts) => (x.participations.some((p) => p.upcoming) ? 1 : 0);
    const fairs = (x: BrandFacts) => new Set(x.participations.map((p) => p.exhibitionId)).size;
    const soonest = (x: BrandFacts) =>
      Math.min(...x.participations.filter((p) => p.upcoming).map((p) => daysUntil(today, p.exhibition.startDate)), Infinity);
    // 소개 원문에 브랜드 이름이 나오면 명단 이름과 소개가 같은 브랜드라는 확인이 하나 더 있는 셈이다
    // (드라이런에서 명단 "어떤웅주", 소개 "어떤우주"처럼 어긋난 곳이 먼저 뽑혔다).
    const named = (x: BrandFacts) => (x.intro && x.names.some((n) => x.intro!.original.includes(n)) ? 1 : 0);
    return (
      up(b) - up(a) ||
      named(b) - named(a) ||
      // 여러 박람회에 나오는 브랜드를 먼저(에디터 역할, 2026-11-03).
      fairs(b) - fairs(a) ||
      b.confirmedCount - a.confirmedCount ||
      soonest(a) - soonest(b) ||
      a.exhibitorId.localeCompare(b.exhibitorId)
    );
  };
}

const hasEnoughForIntro = (b: BrandFacts) =>
  !!b.intro &&
  b.intro.original.length >= MIN_INTRO_CHARS &&
  b.participations.length > 0 &&
  permittedPhotos(b, introParticipation(b)?.participantId).length > 0;

/** 그 박람회 회차에 허락 받은 사진이 있나. */
export const hasFairPhoto = (b: BrandFacts, exhibitionId: string) =>
  permittedPhotos(b, b.participations.find((p) => p.exhibitionId === exhibitionId)?.participantId).length > 0;

export function brandCandidates(world: World, covered: Set<string>): Candidate[] {
  const byId = indexFields(world.fields);
  return world.graph.exhibitors
    .filter((e) => !covered.has(subjectKeyOf.brand(e.id)))
    .map((e) => brandFacts(world, e.id, byId))
    .filter((b): b is BrandFacts => !!b && hasEnoughForIntro(b))
    .sort(brandOrder(world.today))
    .map((brand) => ({ kind: "brand_intro" as const, subjectKey: subjectKeyOf.brand(brand.exhibitorId), brand }));
}

/** 모음에서는 이미 단독으로 소개한 브랜드를 뒤로 미룬다(같은 브랜드가 이틀 연속 나오지 않게). */
export function fairCandidates(world: World, covered: Set<string>): Candidate[] {
  const byId = indexFields(world.fields);
  const out: Candidate[] = [];
  const upcoming = world.exhibitions
    .filter((e) => e.endDate.slice(0, 10) >= world.today && !covered.has(subjectKeyOf.fair(e.id)))
    .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.id.localeCompare(b.id));
  for (const exhibition of upcoming) {
    const participants = world.graph.participants.filter((p) => p.exhibitionId === exhibition.id);
    const brands = [...new Set(participants.map((p) => p.exhibitorId))]
      .map((id) => brandFacts(world, id, byId))
      .filter((b): b is BrandFacts => !!b && !!b.intro && !!leadQuote(b.intro.original) && hasFairPhoto(b, exhibition.id))
      .sort((a, b) => {
        const seen = (x: BrandFacts) => (covered.has(subjectKeyOf.brand(x.exhibitorId)) ? 1 : 0);
        return seen(a) - seen(b) || brandOrder(world.today)(a, b);
      })
      .slice(0, ROUNDUP_SIZE);
    if (brands.length < ROUNDUP_MIN) continue;
    out.push({
      kind: "fair_roundup",
      subjectKey: subjectKeyOf.fair(exhibition.id),
      exhibition,
      brands,
      participantCount: new Set(participants.map((p) => p.exhibitorId)).size,
    });
  }
  return out;
}

/** 지난 편과 다른 종류를 먼저. 처음이면 브랜드 소개부터. */
export function kindOrder(articles: Pick<Article, "kind" | "createdAt">[], forced?: ArticleKind): ArticleKind[] {
  if (forced) return [forced];
  const last = [...articles].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  return last?.kind === "brand_intro" ? ["fair_roundup", "brand_intro"] : ["brand_intro", "fair_roundup"];
}

/**
 * 오늘의 후보들(앞이 우선). 생성기는 앞에서부터 써 보고 게이트를 넘은 첫 편을 저장한다.
 * `limit`은 종류마다 몇 개까지 볼지.
 */
export function pickCandidates(
  world: World,
  articles: Pick<Article, "kind" | "createdAt" | "subjectKey">[],
  opts: { kind?: ArticleKind; limit?: number } = {},
): Candidate[] {
  const covered = new Set(articles.map((a) => a.subjectKey));
  const limit = opts.limit ?? 5;
  return kindOrder(articles, opts.kind).flatMap((k) =>
    (k === "brand_intro" ? brandCandidates(world, covered) : fairCandidates(world, covered)).slice(0, limit),
  );
}

/** 사진 조건에서 몇 곳이 걸러지나. 드라이런과 보고에 쓴다(숫자를 지어내지 않게 실제로 센다). */
export interface PhotoCoverage {
  brands: number;
  /** 확인된 소개 원문이 40자 이상이고 참가 사실이 있는 곳(사진 빼고 소개 조건을 넘는 곳). */
  introReady: number;
  /** 대표 사진 칸이 있는 곳(상태 무관). */
  photoFieldAny: number;
  /** 대표 사진 칸을 사람이 확인한 곳(reviewed, artist_confirmed). */
  photoFieldConfirmed: number;
  /** 어느 회차든 사진 허락(granted, partial + 사진 토큰)이 있는 곳. */
  photoGranted: number;
  /** 사진까지 갖춰 브랜드 소개 후보가 되는 곳. */
  introQualified: number;
  /** 앞으로 열리는 박람회마다: 모음 후보 브랜드 수(소개 인용 + 사진)와 후보가 되는지. */
  fairs: { exhibitionId: string; name: string; withQuote: number; withQuoteAndPhoto: number; qualifies: boolean }[];
}

export function photoCoverage(world: World): PhotoCoverage {
  const byId = indexFields(world.fields);
  const all = world.graph.exhibitors.map((e) => brandFacts(world, e.id, byId)).filter((b): b is BrandFacts => !!b);
  const introReady = all.filter((b) => !!b.intro && b.intro.original.length >= MIN_INTRO_CHARS && b.participations.length > 0);
  const fairs = world.exhibitions
    .filter((e) => e.endDate.slice(0, 10) >= world.today)
    .map((e) => {
      const ids = new Set(world.graph.participants.filter((p) => p.exhibitionId === e.id).map((p) => p.exhibitorId));
      const withQuote = all.filter((b) => ids.has(b.exhibitorId) && !!b.intro && !!leadQuote(b.intro.original));
      const withPhoto = withQuote.filter((b) => hasFairPhoto(b, e.id));
      return {
        exhibitionId: e.id,
        name: e.name,
        withQuote: withQuote.length,
        withQuoteAndPhoto: withPhoto.length,
        qualifies: withPhoto.length >= ROUNDUP_MIN,
      };
    });
  return {
    brands: all.length,
    introReady: introReady.length,
    photoFieldAny: new Set(world.fields.filter((f) => f.field === "photos" && f.exhibitorId).map((f) => f.exhibitorId)).size,
    photoFieldConfirmed: all.filter((b) => !!b.photoField).length,
    photoGranted: all.filter((b) => b.participations.some((p) => p.photoGrant)).length,
    introQualified: introReady.filter(hasEnoughForIntro).length,
    fairs,
  };
}
