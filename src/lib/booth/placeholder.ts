import { slugFromExhibitionId } from "@/lib/exhibition/id";

/**
 * 부스 사진이 없을 때 대신 보여줄 전시별 그림.
 *
 * **데이터가 아니라 표시용이라 `booth.images`에 심지 않는다.** 심으면 "이미지
 * 있음" 집계가 거짓이 되고(운영 콘솔이 채움 현황을 그걸로 센다), 나중에 진짜
 * 사진이 들어와도 이 그림이 갤러리 첫 장에 남는다. 없는 걸 있다고 적는 대신
 * 화면에서만 자리를 메운다.
 *
 * 전시가 늘면 한 줄만 더한다 — `FLOORPLANS`와 같은 자리 규칙이다.
 */
const BY_SLUG: Record<string, string> = {
  "magok-livingmarket-2026":
    "/booths/magok-livingmarket-2026/livingmarket_icon.png",
  // 브랜드를 특정할 사진이 없는 부스는 행사 포스터로 메운다(사용자 결정 2026-10-02).
  "siwse-magok-2026": "/booths/siwse-magok-2026/poster.webp",
  "cafeshow-2026": "/booths/cafeshow-2026/poster.webp",
};

/** 2026-10-02 이전에 관리자 화면으로 만든 전시는 id가 무작위라 되짚기가 안 먹는다.
 *  이후로는 생성도 exhibitionIdFor(slug) 규칙을 쓴다(lib/exhibition/id.ts). */
const ID_TO_SLUG: Record<string, string> = {
  exh_0vqhgewmmupcsmeq: "siwse-magok-2026",
};

/**
 * slug와 exhibitionId 둘 다 받는다 — `/booths/[id]` 라우트엔 slug가 없고
 * `booth.exhibitionId`만 있다(그 페이지의 JudgmentBar도 같은 이유로 id를 쓴다).
 * id는 `exh_<slug의 _ 표기>` 규칙이라 되돌릴 수 있다.
 */
export function boothPlaceholder(key?: string | null): string | undefined {
  if (!key) return undefined;
  const slug = ID_TO_SLUG[key] ?? slugFromExhibitionId(key) ?? key;
  return BY_SLUG[slug];
}
