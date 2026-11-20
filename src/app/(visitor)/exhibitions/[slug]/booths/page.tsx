import { notFound } from "next/navigation";
import { getRepository } from "@/lib/repositories";
import { FLOORPLANS } from "@/lib/floorplans";
import { floorplanHallOf } from "@/lib/floorplan/hall-of";
import { FairNotOpen } from "@/components/exhibition/fair-not-open";
import { isExhibitionOpenCached } from "@/lib/exhibition/open-gate";
import { BoothListScreen } from "@/components/browse/booth-list-screen";
import type { ListBooth } from "@/lib/browse/booth-list";

export const metadata = { title: "부스 목록" };

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ c?: string }>;
};

/**
 * UI 8 둘러보기: 부스 목록(8-01 분류 먼저, 8-02 분류 속 부스, 8-03 하트 없을 때). 로그인 없이 연다
 * (proxy.ts 공개 패턴). 입구는 로미 시트의 "둘러보기 > 부스 목록 보기"(7-02 넷째 줄).
 * `?c=<분류 id>`면 그 분류의 부스 줄(8-02), `?c=hearts`면 하트 남긴 곳(8-01 맨 위 줄이 여는 같은 모양).
 * 줄을 누르면 지도에서 그 부스 카드가 열린다(지도의 `?booth=`).
 */
export default async function BoothListPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { c } = await searchParams;
  const repo = await getRepository();
  const detail = await repo.getExhibition(slug);
  if (!detail) notFound();
  if (!(await isExhibitionOpenCached(detail.exhibition.id))) return <FairNotOpen />;
  const all = await repo.listBoothsByExhibitionId(detail.exhibition.id);

  const floorplan = FLOORPLANS[slug];
  const hallName = new Map(detail.halls.map((h) => [h.id, h.name]));
  const booths: ListBooth[] = all
    .filter((b) => b.kind !== "facility")
    .map((b) => ({
      id: b.id,
      name: b.name,
      code: b.code,
      categoryId: b.categoryId || undefined,
      hall: floorplanHallOf(floorplan, b.code) ?? hallName.get(b.hallId),
      image: b.images[0] ?? b.logoUrl,
    }));
  // 홀 순서: 배치도가 있으면 배치도 순(지도와 같은 말), 그다음 부스 데이터의 홀 순.
  const hallOrder = [
    ...(floorplan?.halls.map((h) => h.name) ?? []),
    ...[...detail.halls].sort((a, b) => a.sort - b.sort).map((h) => h.name),
  ].filter((h, i, arr) => arr.indexOf(h) === i);

  return (
    <BoothListScreen
      slug={slug}
      booths={booths}
      categories={detail.categories.map((cat) => ({ id: cat.id, name: cat.name }))}
      hallOrder={hallOrder}
      category={c}
    />
  );
}
