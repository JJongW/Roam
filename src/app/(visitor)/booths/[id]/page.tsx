import { notFound } from "next/navigation";
import { getBoothDetailCached, listExhibitionsCached } from "@/lib/repositories/cached";
import { getRepository } from "@/lib/repositories";
import { AnalyticsTracker } from "@/components/common/analytics-tracker";
import { BoothExhibitionContextBridge } from "@/components/companion/booth-exhibition-context-bridge";
import { BoothDetailV2 } from "@/components/booth-v2/booth-detail";
import { boothAbout } from "@/lib/booth/about";
import { brandIntroForBooth } from "@/lib/brands/intro";
import { FLOORPLANS } from "@/lib/floorplans";
import { floorplanHallOf } from "@/lib/floorplan/hall-of";
import { devSkeletonDelay } from "@/lib/dev/skeleton-delay";
import { exhibitionStatus } from "@/lib/exhibition/status";
import { todayISO } from "@/lib/exhibition/current";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ skeletonDelay?: string }> };

export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  const detail = await getBoothDetailCached(id);
  if (!detail) return { title: "부스" };
  return {
    title: `${detail.booth.name} | ${detail.booth.company}`,
    description: detail.booth.description,
  };
}

/**
 * 부스 상세(UI 4-02). 디자인 시스템 v2(docs/decisions/2026-11-18_웹-디자인-v2-이전-계획.md).
 * 소개 우선순위는 그대로다: 브랜드 공식 소개 > 부스 저작 요약 > 부스 원문(lib/brands/intro.ts).
 */
export default async function BoothDetailPage({ params, searchParams }: Props) {
  const { id } = await params;
  await devSkeletonDelay((await searchParams).skeletonDelay);
  const detail = await getBoothDetailCached(id);
  if (!detail) notFound();
  const { booth, category, events, welcomeKit } = detail;
  const repo = await getRepository();
  const [brandIntro, exhibitions, halls, appearances] = await Promise.all([
    brandIntroForBooth(repo, booth.id),
    listExhibitionsCached().catch(() => null),
    repo.listHalls(booth.exhibitionId).catch(() => []),
    // 같은 브랜드의 다른 행사 출전(참가사 연결). 실패해도 페이지는 뜬다.
    repo.boothAppearances(booth.id).catch(() => []),
  ]);
  const exhibition = exhibitions?.data.find((e) => e.id === booth.exhibitionId);
  const exhibitionSlug = exhibition?.slug;
  // 끝난 박람회(한국 날짜 기준, 다른 화면과 같은 판정)에서만 평가를 묻는다(6-09).
  const fairEnded = !!exhibition && exhibitionStatus(exhibition, todayISO()) === "ended";
  const hallName =
    floorplanHallOf(exhibitionSlug ? FLOORPLANS[exhibitionSlug] : undefined, booth.code) ??
    halls.find((h) => h.id === booth.hallId)?.name;

  const about = boothAbout(booth);
  const intro = brandIntro?.text ?? about.quote ?? about.fallback;
  const introSource = brandIntro ? "brand" : about.quote ? "summary" : about.fallback ? "original" : undefined;

  return (
    <>
      <AnalyticsTracker type="view" boothId={booth.id} x={booth.x} y={booth.y} />
      <BoothExhibitionContextBridge exhibitionId={booth.exhibitionId} />
      <BoothDetailV2
        booth={{
          id: booth.id,
          name: booth.name,
          code: booth.code,
          images: booth.images,
          instagramUrl: booth.instagramUrl,
          websiteUrl: booth.websiteUrl,
          goods: booth.enrichment?.goodsKeywords ?? [],
        }}
        category={category ? { name: category.name } : undefined}
        hallName={hallName}
        exhibitionSlug={exhibitionSlug}
        intro={intro}
        introSource={introSource}
        events={events}
        welcomeKit={welcomeKit}
        appearances={appearances.map((a) => ({
          boothId: a.boothId,
          exhibitionName: a.exhibitionName,
          displayName: a.displayName,
          boothCode: a.boothCode,
        }))}
        aliases={booth.aliases}
        fairEnded={fairEnded}
      />
    </>
  );
}
