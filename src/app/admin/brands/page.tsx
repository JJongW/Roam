import { getRepository } from "@/lib/repositories";
import { loadBrandData } from "@/lib/brands/load";
import { buildBrandDirectory } from "@/lib/brands/directory";
import { getOutreachStore, subjectsFromGraph } from "@/lib/brands/outreach-store";
import { BrandDirectory } from "@/components/admin/brand-directory";

export const metadata = { title: "브랜드" };

/** 모든 박람회의 브랜드 목록. 칸 채움, 출전 횟수, 품목, 결로 거르고 묶는다. */
export default async function AdminBrandsPage() {
  const repo = await getRepository();
  const data = await loadBrandData(repo);
  // 연락 배지는 연락 보드와 같은 저장 길목에서 읽는다(출전 열쇠). 옛 brand_contact(부스 열쇠)를
  // 직접 읽으면 출전 허락(participant_permission)에 쓴 상태가 안 보여 늘 "보내지 않음"이 된다.
  const store = await getOutreachStore(repo);
  const statuses = await store.statuses(subjectsFromGraph(data.graph));
  const { brands, unlinked } = buildBrandDirectory(data);
  const exhibitionOptions = [...data.exhibitions]
    .sort((a, b) => b.startDate.localeCompare(a.startDate))
    .map((e) => ({ id: e.id, name: e.name }));
  return (
    <BrandDirectory
      brands={brands}
      unlinkedCount={unlinked.length}
      exhibitions={exhibitionOptions}
      contactStatus={Object.fromEntries(statuses)}
    />
  );
}
