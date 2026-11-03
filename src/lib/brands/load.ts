import "server-only";
import type { Repository } from "@/lib/repositories/types";

/**
 * 브랜드 화면들이 같이 쓰는 읽기. 모든 박람회를 한 번에 본다 — 관리자 상단 박람회
 * 선택(쿠키)과 무관하다(2026-11-03 Ted 결정).
 * ⚠️ 부스는 listBoothsFull — 목록 조회는 enrichment 채움 여부를 판단할 컬럼을 다
 * 가져오지 않는다(CLAUDE.md "없음과 비어 있음").
 */
export async function loadBrandData(repo: Repository) {
  const [exhibitions, categories, graph, fields] = await Promise.all([
    repo.listExhibitions({ limit: 500 }),
    repo.listCategories(""),
    repo.loadExhibitorGraph(),
    repo.listProfileFields(),
  ]);
  const booths = (await Promise.all(exhibitions.data.map((e) => repo.listBoothsFull(e.id)))).flat();
  return { exhibitions: exhibitions.data, categories, graph, fields, booths };
}
