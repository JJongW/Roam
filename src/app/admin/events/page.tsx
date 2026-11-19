import { getRepository } from "@/lib/repositories";
import { getAdminFairScope } from "@/lib/admin/fair-scope";
import { AdminFairHeader } from "@/components/admin/admin-fair-header";
import { EventManager } from "@/components/admin/event-manager";

export const metadata = { title: "이벤트 관리" };

export default async function AdminEventsPage() {
  const repo = await getRepository();
  const { exhibitions, exhibition } = await getAdminFairScope();
  if (!exhibition) return <p className="text-muted-foreground">행사가 없어요.</p>;

  const booths = await repo.listBoothsByExhibitionId(exhibition.id);
  const events = await repo.listEvents(exhibition.slug);

  return (
    <div className="space-y-5">
      <AdminFairHeader title="이벤트 관리" exhibitions={exhibitions} exhibition={exhibition} />
      <EventManager events={events} booths={booths} />
    </div>
  );
}
