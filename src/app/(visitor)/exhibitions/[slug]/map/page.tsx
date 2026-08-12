import { notFound } from "next/navigation";
import { getRepository } from "@/lib/repositories";
import { MapView } from "@/components/map/map-view";
import type { BoothEvent } from "@/lib/types";

export const metadata = { title: "지도" };

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ booth?: string }>;
};

export default async function MapPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { booth } = await searchParams;
  const repo = await getRepository();
  const detail = await repo.getExhibition(slug);
  if (!detail) notFound();

  const [booths, events] = await Promise.all([
    repo.listBoothsByExhibitionId(detail.exhibition.id),
    repo.listEvents(slug),
  ]);
  // 지도에서 부스를 선택했을 때 임박 이벤트(cue)를 즉시 말할 수 있게 부스별로
  // 미리 묶어 내려준다 — curateFeed가 이미 하는 것과 같은 그룹핑.
  const eventsByBooth: Record<string, BoothEvent[]> = {};
  for (const e of events) (eventsByBooth[e.boothId] ??= []).push(e);

  return (
    <MapView
      detail={detail}
      booths={booths}
      initialFocusId={booth}
      eventsByBooth={eventsByBooth}
    />
  );
}
