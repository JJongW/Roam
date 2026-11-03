import { getRepository } from "@/lib/repositories";
import { loadBrandData } from "@/lib/brands/load";
import { buildBrandDirectory } from "@/lib/brands/directory";
import { BrandDirectory } from "@/components/admin/brand-directory";

export const metadata = { title: "브랜드" };

/** 모든 박람회의 브랜드 목록. 칸 채움, 출전 횟수, 품목, 결로 거르고 묶는다. */
export default async function AdminBrandsPage() {
  const repo = await getRepository();
  const data = await loadBrandData(repo);
  const contacts = await repo.listBrandContacts();
  const { brands, unlinked } = buildBrandDirectory(data);
  const exhibitionOptions = [...data.exhibitions]
    .sort((a, b) => b.startDate.localeCompare(a.startDate))
    .map((e) => ({ id: e.id, name: e.name }));
  return (
    <BrandDirectory
      brands={brands}
      unlinkedCount={unlinked.length}
      exhibitions={exhibitionOptions}
      contactStatus={Object.fromEntries(contacts.map((c) => [c.boothId, c.status]))}
    />
  );
}
