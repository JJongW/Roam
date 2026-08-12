import { cookies } from "next/headers";
import { getRepository } from "@/lib/repositories";
import { listExhibitionsCached } from "@/lib/repositories/cached";
import { resolveAdminExhibition, todayISO } from "@/lib/exhibition/current";
import { ADMIN_EXHIBITION_COOKIE } from "@/lib/constants";
import { AdminSection } from "@/components/admin/section";
import { PopularChart } from "@/components/charts/popular-chart";
import { ConversionFunnel } from "@/components/charts/conversion-funnel";
import { FlowList } from "@/components/charts/flow-list";
import { Heatmap } from "@/components/charts/heatmap";
import { OnboardingValueChart } from "@/components/charts/onboarding-value-chart";
import { onboardingValueBreakdown } from "@/lib/admin/journey-funnel";

export const metadata = { title: "분석" };

export default async function AnalyticsPage() {
  const repo = await getRepository();
  const { data: exhibitions } = await listExhibitionsCached();
  const cookieId = (await cookies()).get(ADMIN_EXHIBITION_COOKIE)?.value;
  const exhibition = resolveAdminExhibition(exhibitions, cookieId, todayISO());

  if (!exhibition) {
    return <p className="text-muted-foreground">전시가 없습니다.</p>;
  }

  const [points, popular, edges, funnel, booths, signals] = await Promise.all([
    repo.analyticsHeatmap(exhibition.id),
    repo.analyticsPopular(exhibition.id, 8),
    repo.analyticsFlow(exhibition.id),
    repo.analyticsConversion(exhibition.id),
    repo.listBoothsByExhibitionId(exhibition.id),
    repo.listExhibitionSignals(exhibition.id),
  ]);
  const names = Object.fromEntries(booths.map((b) => [b.id, b.name]));
  const onboardingValues = onboardingValueBreakdown(signals);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-extrabold">분석</h1>
        <p className="text-sm text-muted-foreground">{exhibition.name}</p>
      </header>

      <AdminSection
        title="방문 밀집도 히트맵"
        description="부스별 방문·체류 밀집도"
      >
        <Heatmap
          width={exhibition.mapWidth}
          height={exhibition.mapHeight}
          points={points}
        />
      </AdminSection>

      <AdminSection title="인기 부스" description="실제 조회수 기준 상위 부스">
        <PopularChart data={popular} />
      </AdminSection>

      <div className="grid gap-6 lg:grid-cols-2">
        <AdminSection
          title="방문 흐름"
          description="부스 상세를 연달아 본 흐름(근사치 — 실측 동선 아님)"
        >
          <FlowList edges={edges} names={names} />
        </AdminSection>
        <AdminSection
          title="여정 퍼널"
          description="진입 → 온보딩 → 반응 → 판정 → 회고 (직전 단계 대비 %)"
        >
          <ConversionFunnel funnel={funnel} />
        </AdminSection>
      </div>

      <AdminSection
        title="온보딩에서 고른 가치"
        description="문항별 클릭이 아니라 온보딩을 마칠 때 확정한 가치 기준 — 앱 최초진입·전시별 온보딩 합산"
      >
        <OnboardingValueChart data={onboardingValues} />
      </AdminSection>
    </div>
  );
}
