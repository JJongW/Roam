import { listExhibitionsCached } from "@/lib/repositories/cached";
import type { MeFair } from "./view";

/** 마이페이지 화면이 쓰는 박람회 목록(이름, 행사장, 날짜만). 못 불러오면 빈 목록. */
export async function listMeFairs(): Promise<MeFair[]> {
  const page = await listExhibitionsCached().catch(() => null);
  return (page?.data ?? []).map((e) => ({
    id: e.id,
    slug: e.slug,
    name: e.name,
    venue: e.venue,
    startDate: e.startDate,
    endDate: e.endDate,
  }));
}
