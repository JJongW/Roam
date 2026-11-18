// 부스 API 응답에 대표 브랜드 id를 붙인다(2026-11-17, iOS 재구축 토대).
//
// 왜 저장소가 아니라 여기서: listBooths 등 부스 읽기는 피드, 인입, 관리자 화면이 같이
// 쓴다. 그 모두에 조인을 얹지 않고, 앱이 받는 두 응답(목록, 상세)에서만 한 번 더 읽는다.
// 키를 더하기만 하므로 현장 iOS의 기존 디코딩은 그대로다.
//
// 실패해도 부스 화면은 떠야 한다 — 조회가 실패하면 id 없이 그대로 돌려준다(brandIntro와 같은 원칙).
import type { Repository } from "@/lib/repositories/types";

export async function withBrandIds<T extends { id: string }>(
  repo: Repository,
  booths: T[],
): Promise<(T & { exhibitorId?: string; participantId?: string })[]> {
  if (booths.length === 0) return booths;
  let links: Awaited<ReturnType<Repository["listPrimaryBrandLinks"]>>;
  try {
    links = await repo.listPrimaryBrandLinks(booths.map((b) => b.id));
  } catch {
    return booths;
  }
  return booths.map((b) => {
    const l = links[b.id];
    return l ? { ...b, exhibitorId: l.exhibitorId, participantId: l.participantId } : b;
  });
}
