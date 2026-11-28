import { getRepository } from "@/lib/repositories";
import { loadBrandData } from "@/lib/brands/load";
import { buildBrandDirectory } from "@/lib/brands/directory";
import { getOutreachStore, subjectsFromGraph } from "@/lib/brands/outreach-store";
import { boardStatusMap, rowsFromStates } from "@/lib/brands/board-load";
import { todayISO } from "@/lib/exhibition/current";
import { BrandDirectory } from "@/components/admin/brand-directory";

export const metadata = { title: "브랜드" };

/** 모든 박람회의 브랜드 목록. 칸 채움, 출전 횟수, 품목, 결로 거르고 묶는다. */
export default async function AdminBrandsPage() {
  const repo = await getRepository();
  const data = await loadBrandData(repo);
  // 연락 배지는 연락 보드와 같은 저장 길목에서 읽는다(출전 열쇠). 옛 brand_contact(부스 열쇠)를
  // 직접 읽으면 출전 허락(participant_permission)에 쓴 상태가 안 보여 늘 "안 보냄"이 된다.
  // 안 보냄 가운데 연락 수단이 없는 출전은 연락 보드와 같은 계산(rowsFromStates, boardStatus)으로
  // "연락 수단 없음"을 보인다(2026-11-28 Ted). 그래서 상태만이 아니라 연락처까지 읽는다.
  const store = await getOutreachStore(repo);
  const subjects = subjectsFromGraph(data.graph);
  const states = await store.read(subjects);
  const { rows } = rowsFromStates({ subjects, states, graph: data.graph, booths: data.booths, fields: data.fields, today: todayISO() });
  const { brands, unlinked } = buildBrandDirectory(data);
  const exhibitionOptions = [...data.exhibitions]
    .sort((a, b) => b.startDate.localeCompare(a.startDate))
    .map((e) => ({ id: e.id, name: e.name }));
  return (
    <BrandDirectory
      brands={brands}
      unlinkedCount={unlinked.length}
      exhibitions={exhibitionOptions}
      contactStatus={boardStatusMap(rows)}
    />
  );
}
