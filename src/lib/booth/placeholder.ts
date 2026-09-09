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
};

/**
 * slug와 exhibitionId 둘 다 받는다 — `/booths/[id]` 라우트엔 slug가 없고
 * `booth.exhibitionId`만 있다(그 페이지의 JudgmentBar도 같은 이유로 id를 쓴다).
 * id는 `exh_<slug의 _ 표기>` 규칙이라 되돌릴 수 있다.
 */
export function boothPlaceholder(key?: string | null): string | undefined {
  if (!key) return undefined;
  const slug = key.startsWith("exh_")
    ? key.slice(4).replace(/_/g, "-")
    : key;
  return BY_SLUG[slug];
}
