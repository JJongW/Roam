import { getRepository } from "@/lib/repositories";
import { getAdminFairScope } from "@/lib/admin/fair-scope";
import { AdminFairHeader } from "@/components/admin/admin-fair-header";
import { BoothManager } from "@/components/admin/booth-manager";

export const metadata = { title: "부스 관리" };

export default async function AdminBoothsPage() {
  const repo = await getRepository();
  const { exhibitions, exhibition } = await getAdminFairScope();
  if (!exhibition) return <p className="text-muted-foreground">행사가 없어요.</p>;

  const detail = await repo.getExhibition(exhibition.slug);
  // ⚠️ 목록 조회(listBoothsByExhibitionId)를 쓰면 안 된다 — BOOTH_LIST_COLS가
  // images를 안 가져와서 부스 목록의 썸네일이 늘 비어 있었다(2026-09-06 발견).
  // booth-manager가 b.images[0]을 그리므로 전 필드가 필요하다.
  const booths = await repo.listBoothsFull(exhibition.id);

  return (
    <div className="space-y-5">
      <AdminFairHeader title="부스 관리" exhibitions={exhibitions} exhibition={exhibition} />
      <BoothManager
        exhibitionId={exhibition.id}
        booths={booths}
        categories={detail?.categories ?? []}
        halls={detail?.halls ?? []}
      />
    </div>
  );
}
