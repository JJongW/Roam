import Link from "next/link";
import { Building2, Store, CalendarClock, Users, BarChart3, ArrowRight } from "lucide-react";
import { getRepository } from "@/lib/repositories";
import { Card } from "@/components/ui/card";

export default async function AdminOverviewPage() {
  const repo = await getRepository();
  const { data: exhibitions } = await repo.listExhibitions({ limit: 100 });
  const primary = exhibitions[0];

  let boothCount = 0;
  let eventCount = 0;
  let activeWaiting = 0;
  let avgWait = 0;
  if (primary) {
    const booths = await repo.listBoothsByExhibitionId(primary.id);
    boothCount = booths.length;
    eventCount = (await repo.listEvents(primary.slug)).length;
    const waitings = (
      await Promise.all(booths.map((b) => repo.getWaiting(b.id)))
    ).filter((w): w is NonNullable<typeof w> => Boolean(w?.enabled));
    activeWaiting = waitings.length;
    avgWait = waitings.length
      ? Math.round(waitings.reduce((s, w) => s + w.estimatedMinutes, 0) / waitings.length)
      : 0;
  }

  const stats = [
    { label: "전시", value: exhibitions.length, icon: Building2, href: "/admin/exhibitions" },
    { label: "부스", value: boothCount, icon: Store, href: "/admin/booths" },
    { label: "이벤트", value: eventCount, icon: CalendarClock, href: "/admin/events" },
    { label: "대기 운영 부스", value: activeWaiting, icon: Users, href: "/admin/waiting" },
  ];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-extrabold">개요</h1>
        <p className="text-sm text-muted-foreground">{primary?.name ?? "전시 없음"} · 평균 대기 {avgWait}분</p>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
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

      <Link href="/admin/analytics">
        <Card className="flex items-center gap-4 p-5 transition-transform active:scale-[0.99]">
          <div className="flex size-12 items-center justify-center rounded-xl bg-primary/10">
            <BarChart3 className="size-6 text-primary" />
          </div>
          <div className="flex-1">
            <p className="font-bold">분석 대시보드</p>
            <p className="text-sm text-muted-foreground">히트맵 · 인기 부스 · 방문 흐름 · 전환율</p>
          </div>
          <ArrowRight className="size-5 text-muted-foreground" />
        </Card>
      </Link>
    </div>
  );
}
