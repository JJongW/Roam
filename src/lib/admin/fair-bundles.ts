import "server-only";
import type { Repository } from "@/lib/repositories/types";
import type { Exhibition } from "@/lib/types";

/**
 * 행사마다 부스 목록과 신호를 읽는다. 홈(사용자 지표, 포트폴리오, 처리할 것)과
 * 분석의 참고 지표(취향 지형, 취향 이동)가 같은 묶음을 쓴다.
 *
 * ponytail: 전시 수만큼 부스·신호를 각각 읽는다. N이 커지거나 신호가 PostgREST 기본 상한에
 * 닿으면 metrics-rollup 집계 테이블로 옮긴다(docs/admin-automation-architecture.md §9).
 * 부스는 목록 조회(BoothListItem)다. images, longDescription은 없다.
 */
export async function loadFairBundles(repo: Repository, exhibitions: Exhibition[]) {
  return Promise.all(
    exhibitions.map(async (exhibition) => {
      const [booths, signals] = await Promise.all([
        repo.listBoothsByExhibitionId(exhibition.id),
        repo.listExhibitionSignals(exhibition.id),
      ]);
      return { exhibition, booths, signals };
    }),
  );
}
