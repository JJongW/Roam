import { getRepository } from "@/lib/repositories";
import { getAdminFairScope } from "@/lib/admin/fair-scope";
import { AdminFairHeader } from "@/components/admin/admin-fair-header";
import { AdminSection } from "@/components/admin/section";
import { PopularChart } from "@/components/charts/popular-chart";
import { ConversionFunnel } from "@/components/charts/conversion-funnel";
import { FlowList } from "@/components/charts/flow-list";
import { Heatmap } from "@/components/charts/heatmap";
import { OnboardingValueChart } from "@/components/charts/onboarding-value-chart";
import { UiClickChart } from "@/components/charts/ui-click-chart";
import { onboardingValueBreakdown } from "@/lib/admin/journey-funnel";
import { uiClickBreakdown } from "@/lib/admin/ui-click-breakdown";
import { crossTasteBehavior } from "@/lib/admin/taste-behavior";
import { TasteBehaviorCross } from "@/components/admin/taste-behavior-cross";
import { listExhibitionsCached } from "@/lib/repositories/cached";
import { loadFairBundles } from "@/lib/admin/fair-bundles";
import { buildGlobalOverview } from "@/lib/admin/global-overview";
import { learningCurve } from "@/lib/memory/learning-curve";
import { tasteDrift } from "@/lib/admin/taste-drift";
import { TasteDriftCard } from "@/components/admin/taste-drift-card";
import { LearningCurveCard } from "@/components/admin/learning-curve-card";

export const metadata = { title: "분석" };

export default async function AnalyticsPage() {
  const repo = await getRepository();
  const { exhibitions, exhibition } = await getAdminFairScope();

  if (!exhibition) {
    return <p className="text-muted-foreground">행사가 없어요.</p>;
  }

  const [
    points,
    popular,
    edges,
    funnel,
    booths,
    signals,
    analyticsEvents,
    brains,
    reference,
  ] = await Promise.all([
    repo.analyticsHeatmap(exhibition.id),
    repo.analyticsPopular(exhibition.id, 8),
    repo.analyticsFlow(exhibition.id),
    repo.analyticsConversion(exhibition.id),
    repo.listBoothsByExhibitionId(exhibition.id),
    repo.listExhibitionSignals(exhibition.id),
    repo._allAnalytics!(exhibition.id),
    repo.listUserBrains(),
    loadReferenceMetrics(),
  ]);
  const names = Object.fromEntries(booths.map((b) => [b.id, b.name]));
  const onboardingValues = onboardingValueBreakdown(signals);
  const uiClicks = uiClickBreakdown(analyticsEvents);
  const tasteBehavior = crossTasteBehavior(brains, analyticsEvents, booths);

  return (
    <div className="space-y-6">
      <AdminFairHeader title="분석" exhibitions={exhibitions} exhibition={exhibition} />

      <AdminSection
        title="방문 밀집도 히트맵"
        description="부스별 방문, 체류 밀집도"
      >
        <Heatmap
          width={exhibition.mapWidth}
          height={exhibition.mapHeight}
          points={points}
        />
      </AdminSection>

      <AdminSection
        title="취향 × 행동"
        description="가치별로, 그 취향 사용자가 실제로 많이 본 부스 — '태그 없음'은 그 가치 태그가 없는데도 끌린 곳이에요"
      >
        <TasteBehaviorCross result={tasteBehavior} boothNames={names} />
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
        description="문항별 클릭이 아니라 온보딩을 마칠 때 고른 가치예요. 앱 첫 진입과 행사별 온보딩을 합쳤어요"
      >
        <OnboardingValueChart data={onboardingValues} />
      </AdminSection>

      <AdminSection
        title="버튼 인기도"
        description="지도 컨트롤, 피드 CTA, 컴패니언 바 등 전체 클릭 집계"
      >
        <UiClickChart data={uiClicks} />
      </AdminSection>

      {/* 2026-11-19 홈에서 옮겨 옴. 로직은 그대로 두고 자리만 바꿨다. 로미가 동행자로 바뀐(11-08) 뒤로
          추천 정확도와 온보딩에서 확정한 가치는 머리 지표가 아니다(브랜드 규칙 §3, §5). */}
      <section className="space-y-6 border-t border-border pt-8" aria-labelledby="reference-metrics-title">
        <div>
          <h2 id="reference-metrics-title" className="text-lg font-extrabold">
            참고 지표
          </h2>
          <p className="text-sm text-muted-foreground">
            예전 추천 방향을 재던 지표예요. 고른 행사가 아니라 전체 행사를 합산해요.
          </p>
        </div>
        <LearningCurveCard curve={reference.curve} />
        <AdminSection
          title="온보딩에서 고른 가치 (전체 합산)"
          description={`전체 행사 합산, 두 행사 이상에 반응한 사용자 ${reference.overview.multiExhibitionUsers}/${reference.overview.activeUsers}명`}
        >
          <OnboardingValueChart data={reference.overview.values} />
        </AdminSection>
        <TasteDriftCard drift={reference.drift} />
      </section>
    </div>
  );
}

/** 참고 지표(전체 행사 합산). 옛 홈과 같은 계산이다. */
async function loadReferenceMetrics() {
  const repo = await getRepository();
  const [{ data: exhibitions }, users, judgments] = await Promise.all([
    listExhibitionsCached(),
    repo.listUsers(),
    repo.listJudgmentsForCurve(),
  ]);
  const bundles = await loadFairBundles(repo, exhibitions);
  const overview = buildGlobalOverview(
    users,
    bundles.map((b) => ({ exhibition: b.exhibition, boothCount: b.booths.length, signals: b.signals })),
  );
  return { curve: learningCurve(judgments), overview, drift: tasteDrift(bundles) };
}
