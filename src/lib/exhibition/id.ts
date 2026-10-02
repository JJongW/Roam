/**
 * 전시 id = `exh_<slug의 - 를 _ 로>`. 시드·마이그레이션(exh_magok_livingmarket_2026 등)이 써
 * 온 규칙이고, 표시용 등록소(booth/placeholder.ts)가 id에서 slug를 되짚을 때 이 규칙에
 * 기댄다. 관리자 화면으로 만든 전시가 무작위 id를 받아 되짚기가 깨졌다(주류박람회
 * exh_0vqhgewmmupcsmeq, 2026-10-02) — 생성도 같은 규칙을 쓴다.
 */
export function exhibitionIdFor(slug: string): string {
  return `exh_${slug.replace(/-/g, "_")}`;
}

export function slugFromExhibitionId(id: string): string | null {
  return id.startsWith("exh_") ? id.slice(4).replace(/_/g, "-") : null;
}
