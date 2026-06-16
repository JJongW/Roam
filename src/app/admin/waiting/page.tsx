import { getRepository } from "@/lib/repositories";
import { WaitingManager } from "@/components/admin/waiting-manager";
import type { Waiting } from "@/lib/types";

export const metadata = { title: "대기 관리" };

export default async function AdminWaitingPage() {
  const repo = await getRepository();
  const { data: exhibitions } = await repo.listExhibitions({ limit: 1 });
  const exhibition = exhibitions[0];
  if (!exhibition) return <p className="text-muted-foreground">전시가 없습니다.</p>;

  const booths = await repo.listBoothsByExhibitionId(exhibition.id);
  const waitings: Record<string, Waiting> = {};
  await Promise.all(
    booths.map(async (b) => {
      const w = await repo.getWaiting(b.id);
      if (w) waitings[b.id] = w;
    }),
  );

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-extrabold">대기 관리</h1>
        <p className="text-sm text-muted-foreground">부스별 대기열을 실시간으로 업데이트하세요.</p>
      </header>
      <WaitingManager booths={booths} waitings={waitings} />
    </div>
  );
}
