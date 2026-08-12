import { notFound } from "next/navigation";
import { getRepository } from "@/lib/repositories";
import { MapView } from "@/components/map/map-view";
import { deriveCue } from "@/lib/feed/cue";
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
  // 미리 묶는다 — curateFeed가 이미 하는 것과 같은 그룹핑. cue 자체도 여기(서버)
  // 에서 미리 계산해 문자열만 내려준다 — deriveCue의 new Date(...).getHours()가
  // 타임존 의존적이라, 클라에서 다시 계산하면 서버(피드)와 다른 시간대 기준으로
  // 어긋난 답이 나올 수 있다(예: UTC 호스팅 서버 vs KST 기기). 원본 이벤트를
  // 그대로 내리지 않는 건 페이로드 축소 겸.
  const eventsByBooth: Record<string, BoothEvent[]> = {};
  for (const e of events) (eventsByBooth[e.boothId] ??= []).push(e);
  const cueByBooth: Record<string, string> = {};
  for (const b of booths) {
    const cue = deriveCue(b, eventsByBooth[b.id] ?? []);
    if (cue) cueByBooth[b.id] = cue;
  }

  return (
    <MapView
      detail={detail}
      booths={booths}
      initialFocusId={booth}
      cueByBooth={cueByBooth}
    />
  );
}
