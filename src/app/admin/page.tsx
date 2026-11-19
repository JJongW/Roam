import Link from "next/link";
import {
  Building2,
  Users,
  UserCheck,
  Repeat,
  BarChart3,
  ArrowRight,
  ChevronRight,
} from "lucide-react";
import { getRepository } from "@/lib/repositories";
import { listExhibitionsCached } from "@/lib/repositories/cached";
import { exhibitionStatus } from "@/lib/exhibition/status";
import { todayISO } from "@/lib/exhibition/current";
import { FLOORPLANS } from "@/lib/floorplans";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { AdminSection } from "@/components/admin/section";
import { FairPortfolioLink } from "@/components/admin/fair-portfolio-link";
import { TodayQueue } from "@/components/admin/today-queue";
import { UpcomingFairs } from "@/components/admin/upcoming-fairs";
import { buildGlobalOverview } from "@/lib/admin/global-overview";
import { loadFairBundles } from "@/lib/admin/fair-bundles";
import { loadAdminToday } from "@/lib/admin/today-load";

const STATUS_LABEL = {
  upcoming: "예정",
  ongoing: "진행 중",
  ended: "종료",
} as const;

/** 다가오는 박람회는 이 날수 안에 시작하는 것만 본다. */
const UPCOMING_WINDOW_DAYS = 60;

/**
 * 관리자 홈. "오늘 무엇을 처리해야 하나"가 먼저다(2026-11-19 Ted 화면 비평).
 * 순서: 처리할 것 → 다가오는 박람회 → 지표 → 행사 포트폴리오.
 * 로미 학습 곡선, 취향 지형, 취향 이동은 옛 추천 방향을 재던 지표라 /admin/analytics 참고 지표로 옮겼다.
 */
export default async function AdminOverviewPage() {
  const repo = await getRepository();
  const today = todayISO();
  const [{ data: exhibitions }, users, issues] = await Promise.all([
    listExhibitionsCached(),
    repo.listUsers(),
    repo.listIssues({ limit: 1000, sinceDays: 30 }),
  ]);
  const bundles = await loadFairBundles(repo, exhibitions);

  const overview = buildGlobalOverview(
    users,
    bundles.map((b) => ({
      exhibition: b.exhibition,
      boothCount: b.booths.length,
      signals: b.signals,
    })),
  );
  const todayView = await loadAdminToday(repo, {
    exhibitions,
    boothsByFair: new Map(bundles.map((b) => [b.exhibition.id, b.booths])),
    issues,
    today,
    floorplanSlugs: new Set(Object.keys(FLOORPLANS)),
  });

  const stats = [
    {
      label: "행사",
      value: `${exhibitions.length}`,
      icon: Building2,
      href: "/admin/exhibitions",
    },
    {
      label: "총 사용자",
      value: `${overview.totalUsers}`,
      icon: Users,
      href: "/admin/accounts",
    },
    {
      label: "활성 사용자",
      value: `${overview.activeUsers}`,
      icon: UserCheck,
      href: "/admin/accounts",
    },
    {
      label: "두 곳 이상 방문한 사용자 비율",
      sub: `활성 사용자 ${overview.activeUsers}명 중 ${overview.multiExhibitionUsers}명`,
      value: `${Math.round(overview.multiExhibitionRatio * 100)}%`,
      icon: Repeat,
    },
  ];

  return (
    // data-admin-wide: 레이아웃이 홈만 넓게 쓴다(layout.tsx).
    <div data-admin-wide className="space-y-10">
      <header>
        <h1 className="text-2xl font-extrabold">전체</h1>
        <p className="text-sm text-muted-foreground">{today} 기준, Roam 서비스 전체</p>
      </header>

      <TodayQueue items={todayView.items} />

      <UpcomingFairs fairs={todayView.upcoming} windowDays={UPCOMING_WINDOW_DAYS} />

      <section className="space-y-3" aria-labelledby="metrics-title">
        <h2 id="metrics-title" className="text-lg font-extrabold">
          지표
        </h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {stats.map((s) => {
            const card = (
              <Card className="h-full p-4 press active:bg-card-pressed">
                <s.icon className="mb-3 size-5 text-muted-foreground" aria-hidden />
                <p className="text-2xl font-extrabold tabular">{s.value}</p>
                <p className="text-sm text-muted-foreground">{s.label}</p>
                {s.sub && <p className="mt-0.5 text-xs text-muted-foreground tabular">{s.sub}</p>}
              </Card>
            );
            return s.href ? (
              <Link key={s.label} href={s.href} className="block h-full">
                {card}
              </Link>
            ) : (
              <div key={s.label}>{card}</div>
            );
          })}
        </div>
        <Link href="/admin/analytics" className="block">
          <Card className="flex items-center gap-4 p-4 press active:bg-card-pressed">
            <BarChart3 className="size-5 text-muted-foreground" aria-hidden />
            <div className="flex-1">
              <p className="font-bold">행사별 분석</p>
              <p className="text-sm text-muted-foreground">
                히트맵, 인기 부스, 방문 흐름, 전환율, 참고 지표
              </p>
            </div>
            <ArrowRight className="size-5 text-muted-foreground" aria-hidden />
          </Card>
        </Link>
      </section>

      <AdminSection title="행사 포트폴리오" description="누르면 그 행사 분석으로 가요">
        {overview.portfolio.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">아직 행사가 없어요.</p>
        ) : (
          <ul className="divide-y divide-border">
            {overview.portfolio.map((p) => {
              const ex = bundles.find((b) => b.exhibition.id === p.id)!.exhibition;
              const status = exhibitionStatus(ex, today);
              return (
                <li key={p.id} className="py-1 first:pt-0 last:pb-0">
                  <FairPortfolioLink
                    exhibitionId={p.id}
                    className="press -mx-2 flex items-center justify-between gap-3 rounded-lg px-2 py-2 hover:bg-secondary active:bg-card-pressed"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate font-bold">{p.name}</p>
                        <Chip size="sm" variant={status === "ongoing" ? "tint" : "outline"}>
                          {STATUS_LABEL[status]}
                        </Chip>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {p.startDate} ~ {p.endDate}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-bold tabular">방문자 {p.visitorCount}</p>
                      <p className="text-xs text-muted-foreground tabular">부스 {p.boothCount}</p>
                    </div>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                  </FairPortfolioLink>
                </li>
              );
            })}
          </ul>
        )}
      </AdminSection>
    </div>
  );
}
