import { getRepository } from "@/lib/repositories";
import { EventManager } from "@/components/admin/event-manager";

export const metadata = { title: "이벤트 관리" };

export default async function AdminEventsPage() {
  const repo = await getRepository();
  const { data: exhibitions } = await repo.listExhibitions({ limit: 1 });
  const exhibition = exhibitions[0];
  if (!exhibition) return <p className="text-muted-foreground">전시가 없습니다.</p>;

  const booths = await repo.listBoothsByExhibitionId(exhibition.id);
  const events = await repo.listEvents(exhibition.slug);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-extrabold">이벤트 관리</h1>
        <p className="text-sm text-muted-foreground">{exhibition.name}</p>
      </header>
      <EventManager events={events} booths={booths} />
    </div>
  );
}
