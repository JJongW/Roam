import { getRepository } from "@/lib/repositories";
import { pickAdminExhibition, todayISO } from "@/lib/exhibition/current";
import { BoothManager } from "@/components/admin/booth-manager";

export const metadata = { title: "부스 관리" };

export default async function AdminBoothsPage() {
  const repo = await getRepository();
  // 첫 항목이 아니라 "지금 관리해야 할" 전시 — 저장소 정렬은 id 오름차순이라
  // 개막이 한참 남은 전시가 잡힐 수 있다(HOUSE ARCHIVE 추가 때 실제로 그랬다).
  const { data: exhibitions } = await repo.listExhibitions({ limit: 100 });
  const exhibition = pickAdminExhibition(exhibitions, todayISO());
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
