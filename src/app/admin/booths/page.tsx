import { cookies } from "next/headers";
import { getRepository } from "@/lib/repositories";
import { listExhibitionsCached } from "@/lib/repositories/cached";
import { resolveAdminExhibition, todayISO } from "@/lib/exhibition/current";
import { BoothManager } from "@/components/admin/booth-manager";

export const metadata = { title: "부스 관리" };

export default async function AdminBoothsPage() {
  const repo = await getRepository();
  const { data: exhibitions } = await listExhibitionsCached();
  const cookieId = (await cookies()).get("admin_exhibition_id")?.value;
  const exhibition = resolveAdminExhibition(exhibitions, cookieId, todayISO());
  if (!exhibition) return <p className="text-muted-foreground">전시가 없습니다.</p>;

  const detail = await repo.getExhibition(exhibition.slug);
  const booths = await repo.listBoothsByExhibitionId(exhibition.id);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-extrabold">부스 관리</h1>
        <p className="text-sm text-muted-foreground">{exhibition.name}</p>
      </header>
      <BoothManager
        exhibitionId={exhibition.id}
        booths={booths}
        categories={detail?.categories ?? []}
        halls={detail?.halls ?? []}
      />
    </div>
  );
}
