import { z } from "zod";
import { getRepository } from "@/lib/repositories";
import { notFound, ok } from "@/lib/api/http";
import { hasGemini, generateJSON } from "@/lib/ai/gemini";
import type { Booth, Category } from "@/lib/types";

/**
 * Per-category keyword cache. A fair's booths are fixed, so the keywords shown
 * under each interest cell in onboarding don't change between visitors — one
 * Gemini extraction per exhibition, reused until stale.
 */
const cache = new Map<string, { data: Record<string, string[]>; at: number }>();
const TTL_MS = 6 * 60 * 60 * 1000;

/** Distinct booth names/aliases per category — the deterministic fallback (and
 *  the seed the LLM refines). Real publisher/brand names make decent keywords. */
function fallbackKeywords(
  booths: Booth[],
  categories: Category[],
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const c of categories) {
    const names = new Set<string>();
    for (const b of booths) {
      if (b.categoryId !== c.id && !b.tags.includes(c.slug)) continue;
      if (b.name) names.add(b.name);
      for (const a of b.aliases ?? []) names.add(a);
      if (names.size >= 12) break;
    }
    out[c.slug] = [...names].slice(0, 10);
  }
  return out;
}

// Common words that carry no signal as a keyword (Korean + a few generic).
const STOP = new Set([
  "그리고",
  "하지만",
  "에서",
  "관련",
  "정도",
  "구매",
  "방문",
  "부스",
  "출판사",
  "그림책",
  "도서",
  "선물",
  "사기",
  "노트",
  "여기",
  "이거",
  "친구",
]);

/**
 * Frequent words visitors actually wrote in their memos, grouped by the booth's
 * category — the crowd-sourced signal that grows as records pile up. Returns the
 * top terms (seen ≥2×) per category slug.
 */
function noteKeywordsByCategory(
  notes: { boothId: string; memo: string }[],
  booths: Booth[],
  categories: Category[],
): Record<string, string[]> {
  const slugByBooth = new Map<string, string>();
  for (const b of booths) {
    const c = categories.find((x) => x.id === b.categoryId);
    if (c) slugByBooth.set(b.id, c.slug);
  }
  const counts = new Map<string, Map<string, number>>();
  for (const n of notes) {
    const slug = slugByBooth.get(n.boothId);
    if (!slug) continue;
    const bucket = counts.get(slug) ?? new Map<string, number>();
    counts.set(slug, bucket);
    const tokens = n.memo
      .split(/[^\p{L}\p{N}]+/u)
      .map((t) => t.trim())
      .filter((t) => t.length >= 2 && !STOP.has(t));
    for (const t of new Set(tokens)) bucket.set(t, (bucket.get(t) ?? 0) + 1);
  }
  const out: Record<string, string[]> = {};
  for (const [slug, bucket] of counts) {
    out[slug] = [...bucket.entries()]
      .filter(([, n]) => n >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([t]) => t);
  }
  return out;
}

/** Prepend crowd-note keywords (visitor signal) ahead of booth-content ones. */
function mergeNotes(
  base: Record<string, string[]>,
  noteKw: Record<string, string[]>,
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const slug of Object.keys(base)) {
    const seen = new Set<string>();
    const merged: string[] = [];
    for (const k of [...(noteKw[slug] ?? []), ...base[slug]]) {
      if (seen.has(k)) continue;
      seen.add(k);
      merged.push(k);
      if (merged.length >= 8) break;
    }
    out[slug] = merged;
  }
  return out;
}

/**
 * Keywords to preview under each interest (category) cell in onboarding — drawn
 * from visitor memos (crowd signal, prioritised) + the booths in that category
 * (authors, titles, brands, themes). Lazy + cached; falls back to booth names
 * when AI is off.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const repo = await getRepository();
  const detail = await repo.getExhibition(slug);
  if (!detail) return notFound("전시를 찾을 수 없습니다");

  const hit = cache.get(detail.exhibition.id);
  if (hit && Date.now() - hit.at < TTL_MS)
    return ok({ keywords: hit.data, cached: true });

  const booths = await repo.listBoothsByExhibitionId(detail.exhibition.id);
  const categories = detail.categories;
  const fallback = fallbackKeywords(booths, categories);
  // Crowd signal from visitor memos — prioritised when present.
  const notes = await repo.listExhibitionNotes(detail.exhibition.id);
  const noteKw = noteKeywordsByCategory(notes, booths, categories);

  if (!hasGemini) {
    const data = mergeNotes(fallback, noteKw);
    cache.set(detail.exhibition.id, { data, at: Date.now() });
    return ok({ keywords: data });
  }

  try {
    // One batched call: for each category, a few representative keywords pulled
    // from its booths' content (저자·도서명·브랜드·테마).
    const perCat = categories
      .map((c) => {
        const items = booths
          .filter((b) => b.categoryId === c.id || b.tags.includes(c.slug))
          .slice(0, 24)
          .map((b) => `${b.name}: ${b.description ?? ""}`.slice(0, 120))
          .join("\n");
        return `## ${c.slug} (${c.name})\n${items}`;
      })
      .join("\n\n");

    const schema = z.object(
      Object.fromEntries(
        categories.map((c) => [c.slug, z.array(z.string()).max(8)]),
      ),
    ) as unknown as z.ZodType<Record<string, string[]>>;

    const data = await generateJSON<Record<string, string[]>>({
      system:
        "너는 도서전 분야별 핵심 키워드 추출기야. 각 분야의 부스 정보를 보고, 방문객이 흥미를 느낄 만한 구체 키워드(작가명·도서명·브랜드·테마·굿즈 종류)를 분야당 6~8개 한국어로 뽑아 JSON으로만 답해. 일반어(책, 출판사 등) 말고 구체적인 것 위주로.",
      prompt: perCat,
      schema,
    });

    // Merge: prefer LLM keywords, top up with fallback so nothing is empty.
    const merged: Record<string, string[]> = {};
    for (const c of categories) {
      const ai = (data?.[c.slug] ?? []).filter(Boolean);
      const seen = new Set(ai);
      const topped = [...ai];
      for (const f of fallback[c.slug] ?? []) {
        if (topped.length >= 8) break;
        if (!seen.has(f)) topped.push(f);
      }
      merged[c.slug] = topped.slice(0, 8);
    }
    const data2 = mergeNotes(merged, noteKw);
    cache.set(detail.exhibition.id, { data: data2, at: Date.now() });
    return ok({ keywords: data2 });
  } catch {
    const data = mergeNotes(fallback, noteKw);
    cache.set(detail.exhibition.id, { data, at: Date.now() });
    return ok({ keywords: data });
  }
}
