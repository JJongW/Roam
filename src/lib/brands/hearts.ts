// 브랜드 하트 목록 응답 만들기(2026-11-17 Ted 결정: 브랜드 하트는 부스 하트와 따로 저장).
// 브랜드 이름과 다가오는 참가(부스가 아직 없는 참가 포함)를 붙인다.
import type { Repository } from "@/lib/repositories/types";
import type { UpcomingParticipation } from "@/lib/types";

export interface BrandHeartView {
  exhibitorId: string;
  name: string;
  heartedAt: string;
  /** 아직 안 끝난 참가. 시작일 순. 부스 배정 전이면 booth가 없다. */
  upcoming: UpcomingParticipation[];
}

/** 박람회 날짜(YYYY-MM-DD)와 비교할 오늘. 행사가 한국에서 열리므로 한국 날짜로 센다. */
export function kstToday(d = new Date()): string {
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
}

export async function brandHeartViews(repo: Repository, userId: string, today = kstToday()): Promise<BrandHeartView[]> {
  const hearts = await repo.listBrandHearts(userId);
  if (hearts.length === 0) return [];
  const ids = hearts.map((h) => h.exhibitorId);
  const [names, upcoming] = await Promise.all([
    repo.getExhibitorNames(ids),
    repo.listUpcomingParticipations(ids, today),
  ]);
  return hearts.map((h) => ({
    exhibitorId: h.exhibitorId,
    name: names[h.exhibitorId] ?? "",
    heartedAt: h.createdAt,
    upcoming: upcoming.filter((u) => u.exhibitorId === h.exhibitorId),
  }));
}
