import { z } from "zod";
import { getRepository } from "@/lib/repositories";
import {
  ok,
  fail,
  notFound,
  parseBody,
  withErrorBoundary,
} from "@/lib/api/http";
import { hasGemini, generateJSON } from "@/lib/ai/gemini";

const bodySchema = z.object({
  exhibitionSlug: z.string().min(1),
  boothIds: z.array(z.string()).min(1).max(20),
  interests: z.array(z.string()).default([]),
});

const reasonsSchema = z.object({
  reasons: z.record(z.string(), z.string()),
});

/**
 * Per-route reason cache. The booths (and their facts) are fixed for the fair,
 * so the same route + interests always yields the same reasons — re-asking
 * Gemini on every page view is pure waste. We key on the exact booth-set +
 * interests and reuse the result until it goes stale (≥TTL). (Per warm instance;
 * mirrors the community-summary cache.)
 */
const cache = new Map<
  string,
  { reasons: Record<string, string>; at: number }
>();
const TTL_MS = 60 * 60 * 1000;

/**
 * Short, human reasons ("왜 이 부스가 추천됐나") for the route result. One Gemini
 * call returns a {boothId: reason} map; the route page lazy-loads it.
 */
export async function POST(req: Request) {
  return withErrorBoundary(async () => {
    if (!hasGemini) return fail("INTERNAL", "AI가 설정되지 않았어요");

    const parsed = await parseBody(req, bodySchema);
    if (!parsed.ok) return parsed.res;
    const { exhibitionSlug, boothIds, interests } = parsed.data;

    // Reuse a fresh cached map for this exact booth-set + interests.
    const cacheKey = `${exhibitionSlug}|${boothIds.join(",")}|${[...interests].sort().join(",")}`;
    const hit = cache.get(cacheKey);
    if (hit && Date.now() - hit.at < TTL_MS) {
      return ok({ reasons: hit.reasons, cached: true });
    }

    const detail = await repoExhibition(exhibitionSlug);
    if (!detail) return notFound("전시를 찾을 수 없습니다");
    const { booths, catName } = detail;

    const items = boothIds
      .map((id) => booths.get(id))
      .filter((b): b is NonNullable<typeof b> => Boolean(b))
      .map((b) => ({
        id: b.id,
        name: b.name,
        category: catName.get(b.categoryId) ?? "",
        popularity: b.popularity,
      }));
    if (items.length === 0) return ok({ reasons: {} });

    const prompt = [
      "전시 관람객에게 각 부스가 왜 추천 동선에 포함됐는지 한 줄로 설명해줘.",
      "한국어, 부스당 18자 이내, 친근한 반말 금지(존댓말체 명사형 OK).",
      interests.length
        ? `방문객 관심 분야: ${interests.join(", ")}.`
        : "방문객 관심 분야 정보 없음.",
      "아래 부스들에 대해 { reasons: { 부스id: 이유 } } JSON만 출력.",
      "이유는 관심분야 적합/인기/카테고리 특징 위주로. 과장 금지.",
      "",
      JSON.stringify(items),
    ].join("\n");

    const out = await generateJSON({ prompt, schema: reasonsSchema });
    return ok({ reasons: out.reasons });
  });
}

/** Load an exhibition's booths + category-name lookup once. */
async function repoExhibition(slug: string) {
  const repo = await getRepository();
  const detail = await repo.getExhibition(slug);
  if (!detail) return null;
  const list = await repo.listBoothsByExhibitionId(detail.exhibition.id);
  return {
    booths: new Map(list.map((b) => [b.id, b])),
    catName: new Map(detail.categories.map((c) => [c.id, c.name])),
  };
}
