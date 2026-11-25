import { notFound } from "next/navigation";
import { getRepository } from "@/lib/repositories";
import { FairMapScreen } from "@/components/map-v2/fair-map-screen";
import { hasUsableLayout } from "@/lib/floorplan/usable";
import { BackButton } from "@/components/v2/back-button";
import { RomiAvatar } from "@/components/v2/romi-avatar";
import { system } from "@/lib/copy/v1";
import { devSkeletonDelay } from "@/lib/dev/skeleton-delay";
import { FairNotOpen } from "@/components/exhibition/fair-not-open";
import { isExhibitionOpenCached } from "@/lib/exhibition/open-gate";

export const metadata = { title: "지도" };

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ booth?: string; route?: string; romi?: string; skeletonDelay?: string }>;
};

/**
 * 박람회 지도(UI 3-01). 디자인 시스템 v2 첫 화면(docs/decisions/2026-11-18_웹-디자인-v2-이전-계획.md).
 * 예전 v1 화면(관심 밀도, 판단 버튼 카드, 동선)은 components/map/map-view.tsx에 남아 있고
 * 여기서는 쓰지 않는다.
 */
export default async function MapPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { booth, route, romi, skeletonDelay } = await searchParams;
  await devSkeletonDelay(skeletonDelay);
  const repo = await getRepository();
  const detail = await repo.getExhibition(slug);
  if (!detail) notFound();
  if (!(await isExhibitionOpenCached(detail.exhibition.id))) return <FairNotOpen />;
  const booths = await repo.listBoothsByExhibitionId(detail.exhibition.id);

  // 좌표가 없으면 지도는 "없다"가 아니라 거짓이다 — 부스가 한 점에 겹친다. 그리지 않는다.
  if (!hasUsableLayout(booths)) {
    return (
      <div className="flex min-h-dvh flex-col bg-v2-bg-layer-basement font-v2-ui">
        <div className="px-v2-x1-5 pt-safe">
          <BackButton fallbackHref="/" />
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-v2-x3 px-v2-x6 text-center">
          <RomiAvatar size="lg" />
          <p className="text-v2-t6 font-v2-bold text-v2-fg-neutral">{system.noFloorplanTitle}</p>
        </div>
      </div>
    );
  }

  // `?booth=<id>&route=1`: 부스 상세 아래 바 "길 안내"(4-02)로 왔다. 지도에서 그 부스로 길 안내(UI 9)를 바로 시작한다.
  return (
    <FairMapScreen
      // 부스 상세 "지도에서 보기"는 앞의 지도로 돌아간 뒤 그 자리를 `?booth=`로 바꾼다(lib/nav/open-map.ts).
      // 같은 화면에서 부스만 바뀌어도 카드와 초점을 처음부터 다시 잡게 부스마다 새로 그린다.
      key={booth ?? ""}
      detail={detail}
      booths={booths}
      initialFocusId={booth}
      initialRoute={!!booth && route === "1"}
      // `?romi=known`: 부스 목록 8-04 "답 바꾸기"로 왔다. 로미 시트를 1-07 제가 알고 있는 것으로 연다.
      initialRomi={romi === "known" ? "known" : undefined}
    />
  );
}
