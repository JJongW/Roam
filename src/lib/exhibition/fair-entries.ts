import "server-only";
import { getRepository } from "@/lib/repositories";
import type { FairEntry } from "./fair-groups";
import type { MeFair } from "@/lib/me/view";

/**
 * 홈(20-01)과 박람회 전체(20-02)가 읽는 박람회 목록과 열 수 있는지(openable.ts).
 * 못 불러오면 `failed`를 켜고 빈 목록을 준다(화면이 2-01 실패 안내를 띄운다).
 */
export async function loadFairEntries(): Promise<{
  entries: FairEntry[];
  fairs: MeFair[];
  failed: boolean;
}> {
  try {
    const repo = await getRepository();
    const { data } = await repo.listExhibitions({ limit: 100 });
    const openIds = await repo.openExhibitionIds(data.map((ex) => ex.id));
    const entries = data.map((fair) => ({ fair, openable: openIds.has(fair.id) }));
    const fairs = data.map((e) => ({
      id: e.id,
      slug: e.slug,
      name: e.name,
      venue: e.venue,
      startDate: e.startDate,
      endDate: e.endDate,
    }));
    return { entries, fairs, failed: false };
  } catch {
    return { entries: [], fairs: [], failed: true };
  }
}
