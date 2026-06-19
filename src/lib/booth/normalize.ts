import type { Booth } from "@/lib/types";

/**
 * Canonical booth-name normalization, shared by screenshot matching, official-
 * list reconciliation, and integrity audits. Keeping one definition means a name
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
export function boothMatchKeys(booth: Booth): string[] {
  return [booth.name, booth.company, booth.code ?? "", ...(booth.aliases ?? [])]
    .map(normalizeBoothKey)
    .filter((k) => k.length >= 2);
}

/** A booth slot with no real exhibitor assigned (name falls back to its code). */
export function isUnassignedBooth(booth: Booth): boolean {
  return !booth.name || booth.name === booth.code || !booth.company;
}

/** Lounge/stage/aux area on the map that isn't a participating exhibitor.
 *  Excluded from recommendation, swipe, and screenshot matching. */
export function isFacility(booth: Booth): boolean {
  return booth.kind === "facility";
}

/** Exhibitor booths only — the set that recommendation/discovery should act on. */
export function exhibitorBooths(booths: Booth[]): Booth[] {
  return booths.filter((b) => !isFacility(b));
}
