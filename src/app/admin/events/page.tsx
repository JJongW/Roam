import { cookies } from "next/headers";
import { getRepository } from "@/lib/repositories";
import { listExhibitionsCached } from "@/lib/repositories/cached";
import { resolveAdminExhibition, todayISO } from "@/lib/exhibition/current";
import { ADMIN_EXHIBITION_COOKIE } from "@/lib/constants";
import { EventManager } from "@/components/admin/event-manager";

export const metadata = { title: "이벤트 관리" };

export default async function AdminEventsPage() {
  const repo = await getRepository();
  const { data: exhibitions } = await listExhibitionsCached();
  const cookieId = (await cookies()).get(ADMIN_EXHIBITION_COOKIE)?.value;
  const exhibition = resolveAdminExhibition(exhibitions, cookieId, todayISO());
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
