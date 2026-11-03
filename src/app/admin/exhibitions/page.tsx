import { listExhibitionsCached } from "@/lib/repositories/cached";
import { ExhibitionManager } from "@/components/admin/exhibition-manager";

export const metadata = { title: "행사 관리" };

export default async function AdminExhibitionsPage() {
  const { data: exhibitions } = await listExhibitionsCached();

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-extrabold">행사 관리</h1>
        <p className="text-sm text-muted-foreground">행사를 만들고 정보를 고칠 수 있어요.</p>
      </header>
      <ExhibitionManager exhibitions={exhibitions} />
    </div>
  );
}
