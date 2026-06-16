import { getRepository } from "@/lib/repositories";
import { AdminSection } from "@/components/admin/section";
import { PopularChart } from "@/components/charts/popular-chart";
import { ConversionFunnel } from "@/components/charts/conversion-funnel";
import { FlowList } from "@/components/charts/flow-list";
import { Heatmap } from "@/components/charts/heatmap";

export const metadata = { title: "분석" };

export default async function AnalyticsPage() {
  const repo = await getRepository();
  const { data: exhibitions } = await repo.listExhibitions({ limit: 1 });
  const exhibition = exhibitions[0];

  if (!exhibition) {
    return <p className="text-muted-foreground">전시가 없습니다.</p>;
  }

  const [points, popular, edges, funnel, booths] = await Promise.all([
    repo.analyticsHeatmap(exhibition.id),
    repo.analyticsPopular(exhibition.id, 8),
    repo.analyticsFlow(exhibition.id),
    repo.analyticsConversion(exhibition.id),
    repo.listBoothsByExhibitionId(exhibition.id),
  ]);
  const names = Object.fromEntries(booths.map((b) => [b.id, b.name]));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-extrabold">분석</h1>
        <p className="text-sm text-muted-foreground">{exhibition.name}</p>
      </header>

      <AdminSection title="방문 밀집도 히트맵" description="부스별 방문·체류 밀집도">
        <Heatmap width={exhibition.mapWidth} height={exhibition.mapHeight} points={points} />
      </AdminSection>

      <AdminSection title="인기 부스" description="조회수 기준 상위 부스">
        <PopularChart data={popular} />
      </AdminSection>

      <div className="grid gap-6 lg:grid-cols-2">
        <AdminSection title="방문 흐름" description="부스 간 이동이 많은 경로">
          <FlowList edges={edges} names={names} />
        </AdminSection>
        <AdminSection title="전환율" description="세션 → 온보딩 → 경로 → 완료">
          <ConversionFunnel funnel={funnel} />
        </AdminSection>
      </div>
    </div>
  );
}
