import type { BoothListItem } from "@/lib/types";

/**
 * Canonical booth-name normalization, shared by official-list reconciliation
 * and integrity audits. Keeping one definition means a name
 * that matches in one place matches everywhere.
 *
 * Strips whitespace/punctuation, lowercases, and drops common publisher suffixes
 * so "도서출판 부카", "부카(주)", "BUKA Press" all collapse to the same key.
 */
export function normalizeBoothKey(s: string): string {
  return (s ?? "")
    .toLowerCase()
    .replace(/[\s·().,'"’”“·\-_/&]/g, "")
    .replace(
      /(출판사|출판|퍼블리싱|북스|미디어|books?|press|publish(?:ing|ers?)?|co|inc|ltd)$/u,
      "",
    );
}

/** Normalized lookup keys for a booth (name, company, code, co-located
 *  exhibitor aliases), ≥2 chars. */
export function boothMatchKeys(booth: BoothListItem): string[] {
  return [booth.name, booth.company, booth.code ?? "", ...(booth.aliases ?? [])]
    .map(normalizeBoothKey)
    .filter((k) => k.length >= 2);
}

/** A booth slot with no real exhibitor assigned (name falls back to its code). */
export function isUnassignedBooth(booth: BoothListItem): boolean {
  return !booth.name || booth.name === booth.code || !booth.company;
}

/** Lounge/stage/aux area on the map that isn't a participating exhibitor.
 *  Excluded from recommendation and swipe. */
export function isFacility(booth: BoothListItem): boolean {
  return booth.kind === "facility";
}

/** 업계용(B2B) 부스 표시 — 지도·검색엔 두고 취향 추천에서만 뺀다(서울카페쇼 2026-10-02).
 *  카페 창업자가 아니라 방문객에게 "너한테 맞는 곳"으로 포장기계를 권하면 안 된다. */
export const TRADE_TAG = "trade";

/** 취향 추천(랭킹·피드·전시 가치 프로필)이 다루는 부스 — 편의시설과 업계용을 뺀다. */
export function recommendableBooths<T extends BoothListItem>(booths: T[]): T[] {
  return booths.filter((b) => !isFacility(b) && !(b.tags ?? []).includes(TRADE_TAG));
}

/** Exhibitor booths only — the set that recommendation/discovery should act on. */
export function exhibitorBooths<T extends BoothListItem>(booths: T[]): T[] {
  return booths.filter((b) => !isFacility(b));
}
