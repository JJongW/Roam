import { getRepository } from "@/lib/repositories";
import { BrandTabs } from "@/components/admin/brands/brand-tabs";

/**
 * 브랜드 메뉴 하나에 두 화면 — 브랜드 목록과 연결 확인 목록(2026-11-03 Ted 결정:
 * "브랜드"와 "브랜드 연결"을 합친다). 모든 박람회를 한 번에 보고, 박람회는 화면 안에서 거른다.
 */
export default async function BrandsLayout({ children }: { children: React.ReactNode }) {
  const repo = await getRepository();
  const pending = (await repo.listExhibitorLinkCandidates("pending")).length;
  return (
    <div className="space-y-5">
      <header className="space-y-3">
        <h1 className="text-2xl font-extrabold">브랜드</h1>
        <BrandTabs pending={pending} />
      </header>
      {children}
    </div>
  );
}
