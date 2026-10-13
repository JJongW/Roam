import Link from "next/link";
import { notFound } from "next/navigation";
import { Map as MapIcon } from "lucide-react";
import { getRepository } from "@/lib/repositories";
import { MapView } from "@/components/map/map-view";
import { deriveCue } from "@/lib/feed/cue";
import { hasUsableLayout } from "@/lib/floorplan/usable";
import { Toolbar } from "@/components/common/toolbar";
import { EmptyState } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { getI18n } from "@/lib/i18n/server";
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
  // 좌표가 없으면 지도는 "없다"가 아니라 **거짓**이다 — 부스 전부가 한 점에
  // 겹쳐서 전시장 한 구석에 모여 있다고 읽힌다. 그릴 수 없으면 그러지 않는다.
  if (!hasUsableLayout(booths)) {
    const { t } = await getI18n();
    return (
      <div className="flex min-h-dvh flex-col">
        <Toolbar title={detail.exhibition.name} />
        <EmptyState
          icon={MapIcon}
          title={t("map.noLayout")}
          description={t("map.noLayoutDesc")}
          className="flex-1"
          action={
            <Button variant="outline" asChild>
              <Link href={`/exhibitions/${slug}`}>
                {t("map.noLayoutAction")}
              </Link>
            </Button>
          }
        />
      </div>
    );
  }

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
