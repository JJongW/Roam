// 부스 API 응답에 대표 브랜드 id를 붙인다(2026-11-17, iOS 재구축 토대).
//
// 왜 저장소가 아니라 여기서: listBooths 등 부스 읽기는 피드, 인입, 관리자 화면이 같이
// 쓴다. 그 모두에 조인을 얹지 않고, 앱이 받는 두 응답(목록, 상세)에서만 한 번 더 읽는다.
// 키를 더하기만 하므로 현장 iOS의 기존 디코딩은 그대로다.
//
// 실패해도 부스 화면은 떠야 한다 — 조회가 실패하면 id 없이 그대로 돌려준다(brandIntro와 같은 원칙).
import type { Repository } from "@/lib/repositories/types";

export type BoothBrandIds = {
  exhibitorId?: string;
  participantId?: string;
  /** 브랜드(exhibitor) 이름. `names`를 켠 응답에만 있다. 배정은 있는데 이름을 못 읽으면 null(2026-11-19,
   *  iOS 부스 상세 브랜드 줄 UI 19-A1이 부스 이름 대신 브랜드 이름을 쓴다). */
  exhibitorName?: string | null;
};

export async function withBrandIds<T extends { id: string }>(
  repo: Repository,
  booths: T[],
  opts: { names?: boolean } = {},
): Promise<(T & BoothBrandIds)[]> {
  if (booths.length === 0) return booths;
  let links: Awaited<ReturnType<Repository["listPrimaryBrandLinks"]>>;
  try {
    links = await repo.listPrimaryBrandLinks(booths.map((b) => b.id));
  } catch {
    return booths;
  }
  // 이름은 상세처럼 부스 몇 개일 때만 읽는다(목록 500곳마다 조회를 하나 더 얹지 않는다).
  // 실패해도 id는 그대로 붙이고 이름만 null로 둔다 — 앱은 부스 이름으로 물러선다.
  let names: Record<string, string> | null = null;
  if (opts.names) {
    const ids = [...new Set(Object.values(links).map((l) => l.exhibitorId))];
    try {
      names = ids.length ? await repo.getExhibitorNames(ids) : {};
    } catch {
      names = {};
    }
  }
  return booths.map((b) => {
    const l = links[b.id];
    if (!l) return b;
    const out: T & BoothBrandIds = { ...b, exhibitorId: l.exhibitorId, participantId: l.participantId };
    if (names) out.exhibitorName = names[l.exhibitorId]?.trim() || null;
    return out;
  });
}
