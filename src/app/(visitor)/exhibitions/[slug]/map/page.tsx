import { notFound } from "next/navigation";
import { getRepository } from "@/lib/repositories";
import { FairMapScreen } from "@/components/map-v2/fair-map-screen";
import { hasUsableLayout } from "@/lib/floorplan/usable";
import { BackButton } from "@/components/v2/back-button";
import { RomiAvatar } from "@/components/v2/romi-avatar";
import { system } from "@/lib/copy/v1";
import { devSkeletonDelay } from "@/lib/dev/skeleton-delay";

export const metadata = { title: "지도" };

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ booth?: string; skeletonDelay?: string }>;
};

/**
 * 박람회 지도(UI 3-01). 디자인 시스템 v2 첫 화면(docs/decisions/2026-11-18_웹-디자인-v2-이전-계획.md).
 * 예전 v1 화면(관심 밀도, 판단 버튼 카드, 동선)은 components/map/map-view.tsx에 남아 있고
 * 여기서는 쓰지 않는다.
 */
export default async function MapPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { booth, skeletonDelay } = await searchParams;
  await devSkeletonDelay(skeletonDelay);
  const repo = await getRepository();
  const detail = await repo.getExhibition(slug);
  if (!detail) notFound();
  const booths = await repo.listBoothsByExhibitionId(detail.exhibition.id);

  // 좌표가 없으면 지도는 "없다"가 아니라 거짓이다 — 부스가 한 점에 겹친다. 그리지 않는다.
  if (!hasUsableLayout(booths)) {
    return (
      <div className="flex min-h-dvh flex-col bg-v2-bg-layer-basement font-v2-ui">
        <div className="px-v2-x4 pt-safe">
          <BackButton fallbackHref="/" />
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-v2-x3 px-v2-x6 text-center">
          <RomiAvatar size="lg" />
          <p className="text-v2-t6 font-v2-bold text-v2-fg-neutral">{system.noFloorplanTitle}</p>
        </div>
      </div>
    );
  }

  return <FairMapScreen detail={detail} booths={booths} initialFocusId={booth} />;
}
