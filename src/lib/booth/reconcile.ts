import type { Booth } from "@/lib/types";
import {
  normalizeBoothKey,
  boothMatchKeys,
  isUnassignedBooth,
} from "@/lib/booth/normalize";

/** One entry from the official exhibition exhibitor list. `name` required;
 *  `code` (booth number) and `publisher` optional. Tolerant by design so a CSV
 *  or scraped list maps in with minimal massaging. */
export interface OfficialEntry {
  name: string;
  code?: string;
  publisher?: string;
}

export interface BoothAudit {
  total: number;
  /** Booth slots with no real exhibitor assigned (name === code, empty company). */
  unassigned: Booth[];
  /** Codes appearing on more than one booth. */
  duplicateCodes: string[];
  /** Normalized names appearing on more than one booth. */
  duplicateNames: string[];
  /** Booths missing map coordinates. */
  missingCoords: Booth[];
}

/**
 * List-independent integrity check on the booth DB. Surfaces the data problems
 * that break matching/recommendation before any official list is involved.
 */
export function auditBooths(booths: Booth[]): BoothAudit {
  const codeCount = new Map<string, number>();
  const nameCount = new Map<string, number>();
  for (const b of booths) {
    if (b.code) codeCount.set(b.code, (codeCount.get(b.code) ?? 0) + 1);
    const key = normalizeBoothKey(b.name);
    if (key) nameCount.set(key, (nameCount.get(key) ?? 0) + 1);
  }
  return {
    total: booths.length,
    unassigned: booths.filter(isUnassignedBooth),
    duplicateCodes: [...codeCount].filter(([, n]) => n > 1).map(([c]) => c),
    duplicateNames: [...nameCount].filter(([, n]) => n > 1).map(([n]) => n),
    missingCoords: booths.filter((b) => b.x == null || b.y == null),
  };
}

export interface ReconcileReport {
  /** Official entry ↔ booth pairs (exact code or normalized-name hit). */
  matched: { entry: OfficialEntry; booth: Booth }[];
  /** Official exhibitors with no booth in the map DB. */
  missingFromMap: OfficialEntry[];
  /** Booths with no entry in the official list (stale/placeholder slots). */
  notInOfficial: Booth[];
}

/**
 * Reconcile the booth DB against the official exhibitor list. Matches by booth
 * code first (authoritative), then by normalized name. Whatever doesn't line up
 * is reported honestly as missing-from-map or not-in-official — the no-match
 * cleanup set — rather than being silently forced together.
 */
export function reconcile(
  official: OfficialEntry[],
  booths: Booth[],
): ReconcileReport {
  const byCode = new Map<string, Booth>();
  const byName = new Map<string, Booth>();
  for (const b of booths) {
    if (b.code) byCode.set(normalizeBoothKey(b.code), b);
    for (const key of boothMatchKeys(b)) {
      if (!byName.has(key)) byName.set(key, b);
    }
  }

  const matched: ReconcileReport["matched"] = [];
  const missingFromMap: OfficialEntry[] = [];
  const usedBoothIds = new Set<string>();

  for (const entry of official) {
    let booth: Booth | undefined;
    if (entry.code) booth = byCode.get(normalizeBoothKey(entry.code));
    if (!booth) booth = byName.get(normalizeBoothKey(entry.name));
    if (booth) {
      matched.push({ entry, booth });
      usedBoothIds.add(booth.id);
    } else {
      missingFromMap.push(entry);
    }
  }

  const notInOfficial = booths.filter((b) => !usedBoothIds.has(b.id));
  return { matched, missingFromMap, notInOfficial };
}
