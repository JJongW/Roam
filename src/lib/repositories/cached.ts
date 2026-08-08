import "server-only";
import { cache } from "react";
import { getRepository } from "@/lib/repositories";
import type { BoothDetail, Exhibition, ExhibitionDetail, Paginated } from "@/lib/types";

/**
 * 요청 단위로 중복 제거된 전시 조회.
 *
 * 전시 홈은 `getExhibition`을 직접 한 번, `curateFeed → rankForExhibition`에서 또 한 번
 * 부른다. 이 조회 하나가 1.5초쯤 걸려서 같은 데이터를 두 번 가져오는 값이 그대로 렌더
 * 지연이 됐다(2026-07-27 감사 P1-3). React `cache`는 렌더 요청 안에서만 살아 있으므로
 * 전시 정보가 낡을 걱정 없이 중복만 걷어낸다.
 */
export const getExhibitionCached = cache(
  async (slug: string): Promise<ExhibitionDetail | null> => {
    const repo = await getRepository();
    return repo.getExhibition(slug);
  },
);

/**
 * 요청 단위로 중복 제거된 부스 상세 조회.
 *
 * 부스 상세 페이지는 `generateMetadata`에서 한 번, 본문에서 또 한 번 같은 조회를
 * 한다. 조회 하나가 부스 1건 + (카테고리·리뷰·웰컴키트·이벤트·enrichment) 병렬
 * 1세트라, 중복이 곧 DB 왕복 두 세트다. 전시와 같은 이유·같은 방법으로 걷어낸다.
 */
export const getBoothDetailCached = cache(
  async (id: string): Promise<BoothDetail | null> => {
    const repo = await getRepository();
    return repo.getBoothDetail(id);
  },
);

/**
 * 요청 단위로 중복 제거된 전시 목록 조회(admin 전용, limit 100 고정).
 *
 * admin 레이아웃(전시 선택기)이 추가되며 부스·이벤트·분석 페이지가 이미 하던
 * `listExhibitions({ limit: 100 })` 호출에 레이아웃의 호출이 하나 더 겹치게
 * 됐다 — 전시 상세·부스 상세와 같은 이유·같은 방법(react cache)으로 걷어낸다.
 */
export const listExhibitionsCached = cache(
  async (): Promise<Paginated<Exhibition>> => {
    const repo = await getRepository();
    return repo.listExhibitions({ limit: 100 });
  },
);
