import Link from "next/link";
import {
  Building2,
  Users,
  UserCheck,
  Repeat,
  BarChart3,
  ArrowRight,
  AlertTriangle,
  Bug,
} from "lucide-react";
import { getRepository } from "@/lib/repositories";
import { listExhibitionsCached } from "@/lib/repositories/cached";
import { exhibitionStatus } from "@/lib/exhibition/status";
import { todayISO } from "@/lib/exhibition/current";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { AdminSection } from "@/components/admin/section";
import { OnboardingValueChart } from "@/components/charts/onboarding-value-chart";
import { buildGlobalOverview } from "@/lib/admin/global-overview";
import { groupIssues } from "@/lib/admin/issue-grouping";
import { findBoothEnrichmentGaps } from "@/lib/admin/data-issues";

const STATUS_LABEL = {
  upcoming: "예정",
  ongoing: "진행 중",
  ended: "종료",
} as const;

/** L1 전역 대시보드 — 전시를 고르지 않아도 뜬다. 전시별(L2)은 /admin/analytics. */
export default async function AdminOverviewPage() {
  const repo = await getRepository();
  const [{ data: exhibitions }, users, issues] = await Promise.all([
    listExhibitionsCached(),
    repo.listUsers(),
    repo.listIssues({ limit: 1000, sinceDays: 30 }),
  ]);

  // ponytail: 전시 수만큼 부스·신호를 각각 읽는다(N≈3). N이 커지거나 신호가
  // PostgREST 기본 상한에 닿으면 metrics-rollup 집계 테이블로 옮긴다
  // (docs/admin-automation-architecture.md §9).
  const bundles = await Promise.all(
    exhibitions.map(async (exhibition) => {
      const [booths, signals] = await Promise.all([
        repo.listBoothsByExhibitionId(exhibition.id),
        repo.listExhibitionSignals(exhibition.id),
      ]);
      return { exhibition, booths, signals };
    }),
  );

  const overview = buildGlobalOverview(
    users,
    bundles.map((b) => ({
      exhibition: b.exhibition,
      boothCount: b.booths.length,
      signals: b.signals,
    })),
  );

  // 노트 정합성(findNoteInconsistencies)은 여기서 세지 않는다 — 전 전시 부스
  // 1200여 개를 listNotesByBoothIds에 넣으면 PostgREST가 그 id를 전부 URL에
  // 담아 길이 상한에 걸리고, 실패해도 data:null → [] 이라 0건으로 위장된다.
  // 노트 정합성은 전시별 /admin/errors가 그대로 본다.
  const dataIssueCount = findBoothEnrichmentGaps(
    bundles.flatMap((b) => b.booths),
  ).length;
  const issueCount = groupIssues(issues).length;

  const today = todayISO();
  const stats = [
    {
      label: "전시",
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
      label: "멀티 전시",
      value: `${Math.round(overview.multiExhibitionRatio * 100)}%`,
      icon: Repeat,
    },
  ];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-extrabold">전체</h1>
        <p className="text-sm text-muted-foreground">
          Roam 서비스 전체 — 전시를 고르지 않아도 뜹니다
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => {
          const card = (
            <Card className="p-4 transition-transform active:scale-[0.99]">
              <s.icon className="mb-3 size-6 text-primary" />
              <p className="text-2xl font-extrabold tabular">{s.value}</p>
              <p className="text-sm text-muted-foreground">{s.label}</p>
            </Card>
          );
          return s.href ? (
            <Link key={s.label} href={s.href}>
              {card}
            </Link>
          ) : (
            <div key={s.label}>{card}</div>
          );
        })}
      </div>

      <AdminSection
        title="취향 지형"
        description={`온보딩에서 확정한 가치, 전 전시 합산 · 멀티 전시 방문 ${overview.multiExhibitionUsers}/${overview.activeUsers}명`}
      >
        <OnboardingValueChart data={overview.values} />
      </AdminSection>

      <AdminSection
        title="전시 포트폴리오"
        description="전시 전환은 상단 선택기에서"
      >
        {overview.portfolio.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            아직 전시가 없습니다.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {overview.portfolio.map((p) => {
              const ex = bundles.find((b) => b.exhibition.id === p.id)!
                .exhibition;
              const status = exhibitionStatus(ex, today);
              return (
                <li
                  key={p.id}
                  className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-bold">{p.name}</p>
                      <Chip
                        size="sm"
                        variant={status === "ongoing" ? "tint" : "outline"}
                      >
                        {STATUS_LABEL[status]}
                      </Chip>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {p.startDate} – {p.endDate}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-bold tabular">
                      방문자 {p.visitorCount}
                    </p>
                    <p className="text-xs text-muted-foreground tabular">
                      부스 {p.boothCount}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </AdminSection>

      <div className="grid grid-cols-2 gap-3">
        <Link href="/admin/errors">
          <Card className="flex items-center gap-3 p-4 transition-transform active:scale-[0.99]">
            <Bug
              className={
                issueCount > 0
                  ? "size-5 shrink-0 text-destructive"
                  : "size-5 shrink-0 text-muted-foreground"
              }
            />
            <div>
              <p className="font-bold">
                {issueCount > 0 ? `오류 ${issueCount}건` : "오류 없음"}
              </p>
              <p className="text-xs text-muted-foreground">최근 30일</p>
            </div>
          </Card>
        </Link>
        <Link href="/admin/errors">
          <Card className="flex items-center gap-3 p-4 transition-transform active:scale-[0.99]">
            <AlertTriangle
              className={
                dataIssueCount > 0
                  ? "size-5 shrink-0 text-warning"
                  : "size-5 shrink-0 text-muted-foreground"
              }
            />
            <div>
              <p className="font-bold">
                {dataIssueCount > 0
                  ? `데이터 이슈 ${dataIssueCount}건`
                  : "데이터 이슈 없음"}
              </p>
              <p className="text-xs text-muted-foreground">
                전 전시 · 부스 필수 필드 결측
              </p>
            </div>
          </Card>
        </Link>
      </div>

      <Link href="/admin/analytics">
        <Card className="flex items-center gap-4 p-5 transition-transform active:scale-[0.99]">
          <div className="flex size-12 items-center justify-center rounded-xl bg-primary/10">
            <BarChart3 className="size-6 text-primary" />
          </div>
          <div className="flex-1">
            <p className="font-bold">전시별 분석</p>
            <p className="text-sm text-muted-foreground">
              히트맵 · 인기 부스 · 방문 흐름 · 전환율
            </p>
          </div>
          <ArrowRight className="size-5 text-muted-foreground" />
        </Card>
      </Link>
    </div>
  );
}
