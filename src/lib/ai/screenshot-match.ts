import type { Booth } from "@/lib/types";
import {
  normalizeBoothKey,
  boothMatchKeys,
  isFacility,
} from "@/lib/booth/normalize";

/**
 * Deterministic booth matching for screenshot-extracted terms.
 *
 * Gemini only perceives (extracts publisher/brand/title strings from the image);
 * mapping those strings to real booths happens here, against the exhibition's
 * actual booth list. Keeping match logic out of the model means we never trust a
 * hallucinated booth id, and unmatched terms surface honestly as "no-match"
 * instead of being forced onto the nearest booth.
 */

export interface BoothMatch {
  boothId: string;
  /** 1.0 exact normalized hit, 0.7 substring hit. */
  confidence: number;
  /** The screenshot term that matched. */
  term: string;
}

export interface MatchResult {
  matches: BoothMatch[];
  /** Terms the model saw but no booth matched — the honest no-match set. */
  unmatched: string[];
}

/**
 * Map extracted terms to booths. A term matches a booth when its normalized form
 * equals or contains (or is contained by) the booth's normalized name/company/
 * code. Exact hits score 1.0, substring hits 0.7. One booth per term (best hit);
 * terms with no hit go to `unmatched`.
 */
export function matchTermsToBooths(
  terms: string[],
  booths: Booth[],
): MatchResult {
  // Facility areas (lounge/stage) aren't exhibitors — never a screenshot match.
  const index = booths
    .filter((b) => !isFacility(b))
    .map((b) => ({ booth: b, keys: boothMatchKeys(b) }));

  const matches: BoothMatch[] = [];
  const unmatched: string[] = [];
  const seenBooth = new Set<string>();

  for (const raw of terms) {
    const term = raw.trim();
    const nTerm = normalizeBoothKey(term);
    if (nTerm.length < 2) continue;

    let best: { boothId: string; confidence: number } | null = null;
    for (const { booth, keys } of index) {
      for (const key of keys) {
        let score = 0;
        if (key === nTerm) score = 1;
        else if (key.includes(nTerm) || nTerm.includes(key)) score = 0.7;
        if (score > (best?.confidence ?? 0)) {
          best = { boothId: booth.id, confidence: score };
        }
      }
    }

    if (best && !seenBooth.has(best.boothId)) {
      seenBooth.add(best.boothId);
      matches.push({
        boothId: best.boothId,
        confidence: best.confidence,
        term,
      });
    } else if (!best) {
      unmatched.push(term);
    }
  }

  // Strongest matches first so the UI can lead with high-confidence booths.
  matches.sort((a, b) => b.confidence - a.confidence);
  return { matches, unmatched };
}
