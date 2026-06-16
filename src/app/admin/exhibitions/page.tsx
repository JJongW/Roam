import { getRepository } from "@/lib/repositories";
import { ExhibitionManager } from "@/components/admin/exhibition-manager";

export const metadata = { title: "전시 관리" };

export default async function AdminExhibitionsPage() {
  const repo = await getRepository();
  const { data: exhibitions } = await repo.listExhibitions({ limit: 100 });

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-extrabold">전시 관리</h1>
        <p className="text-sm text-muted-foreground">전시를 만들고 정보를 수정하세요.</p>
      </header>
      <ExhibitionManager exhibitions={exhibitions} />
    </div>
  );
}
