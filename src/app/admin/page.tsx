import Link from "next/link";
import { cookies } from "next/headers";
import {
  Building2,
  Store,
  CalendarClock,
  BarChart3,
  ArrowRight,
  AlertTriangle,
  Bug,
} from "lucide-react";
import { getRepository } from "@/lib/repositories";
import { listExhibitionsCached } from "@/lib/repositories/cached";
import { resolveAdminExhibition, todayISO } from "@/lib/exhibition/current";
import { ADMIN_EXHIBITION_COOKIE } from "@/lib/constants";
import { Card } from "@/components/ui/card";
import { groupIssues } from "@/lib/admin/issue-grouping";
import {
  findBoothEnrichmentGaps,
  findNoteInconsistencies,
} from "@/lib/admin/data-issues";

export default async function AdminOverviewPage() {
  const repo = await getRepository();
  const { data: exhibitions } = await listExhibitionsCached();
  const cookieId = (await cookies()).get(ADMIN_EXHIBITION_COOKIE)?.value;
  const primary = resolveAdminExhibition(exhibitions, cookieId, todayISO());

  let boothCount = 0;
  let eventCount = 0;
  let issueCount = 0;
  let dataIssueCount = 0;
  if (primary) {
    const booths = await repo.listBoothsByExhibitionId(primary.id);
    boothCount = booths.length;
    eventCount = (await repo.listEvents(primary.slug)).length;

    const issues = await repo.listIssues({ sinceDays: 30 });
    issueCount = groupIssues(issues).length;

    const boothIds = booths.map((b) => b.id);
    const notes = await repo.listNotesByBoothIds(boothIds);
    dataIssueCount =
      findBoothEnrichmentGaps(booths).length +
      findNoteInconsistencies(notes).length;
  }

  const stats = [
    {
      label: "전시",
      value: exhibitions.length,
      icon: Building2,
      href: "/admin/exhibitions",
    },
    { label: "부스", value: boothCount, icon: Store, href: "/admin/booths" },
    {
      label: "이벤트",
      value: eventCount,
      icon: CalendarClock,
      href: "/admin/events",
    },
  ];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-extrabold">개요</h1>
        <p className="text-sm text-muted-foreground">
          {primary?.name ?? "전시 없음"}
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {stats.map((s) => (
          <Link key={s.label} href={s.href}>
            <Card className="p-4 transition-transform active:scale-[0.99]">
              <s.icon className="mb-3 size-6 text-primary" />
              <p className="text-2xl font-extrabold tabular">{s.value}</p>
              <p className="text-sm text-muted-foreground">{s.label}</p>
            </Card>
          </Link>
        ))}
      </div>

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
                필수 필드 결측 · 정합성
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
            <p className="font-bold">분석 대시보드</p>
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
