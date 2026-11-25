import { listExhibitionsCached } from "@/lib/repositories/cached";
import { getRepository } from "@/lib/repositories";
import type { MeFair } from "./view";

/**
 * 마이페이지 화면이 쓰는 박람회 목록(이름, 행사장, 날짜, 지도를 열 수 있는지). 못 불러오면 빈 목록.
 * 열 수 있는지를 못 읽으면 칸을 비워 두고, 화면은 예전처럼 지도 링크를 둔다(지도가 "진행 예정"을 안내한다).
 */
export async function listMeFairs(): Promise<MeFair[]> {
  const page = await listExhibitionsCached().catch(() => null);
  const data = page?.data ?? [];
  const openIds = await getRepository()
    .then((repo) => repo.openExhibitionIds(data.map((e) => e.id)))
    .catch(() => null);
  return data.map((e) => ({
    id: e.id,
    slug: e.slug,
    name: e.name,
    venue: e.venue,
    startDate: e.startDate,
    endDate: e.endDate,
    ...(openIds ? { openable: openIds.has(e.id) } : {}),
  }));
}
