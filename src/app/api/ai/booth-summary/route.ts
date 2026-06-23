import { z } from "zod";
import { getRepository } from "@/lib/repositories";
import { ok, fail, notFound, parseBody, withErrorBoundary } from "@/lib/api/http";
import { hasGemini, generateText } from "@/lib/ai/gemini";

const bodySchema = z.object({ boothId: z.string().min(1) });

/**
 * One-line booth summary cache. A booth's facts are fixed for the fair, so the
 * same booth always yields the same summary — re-asking Gemini per page view is
 * waste. Keyed by boothId, reused until stale. (Per warm instance; mirrors the
 * route-reasons / community-summary caches.)
 */
const cache = new Map<string, { summary: string; at: number }>();
const TTL_MS = 60 * 60 * 1000;

/**
 * A single-sentence "이 부스 한 줄 요약" shown above the booth intro. The detail
 * page lazy-loads it so the page paints instantly; falls back to nothing when AI
 * is off or fails (the full intro still covers it).
 */
export async function POST(req: Request) {
  return withErrorBoundary(async () => {
    if (!hasGemini) return fail("INTERNAL", "AI가 설정되지 않았어요");
    const parsed = await parseBody(req, bodySchema);
    if (!parsed.ok) return parsed.res;
    const { boothId } = parsed.data;

    const hit = cache.get(boothId);
    if (hit && Date.now() - hit.at < TTL_MS)
      return ok({ summary: hit.summary, cached: true });

    const repo = await getRepository();
    const detail = await repo.getBoothDetail(boothId);
    if (!detail) return notFound("부스를 찾을 수 없습니다");
    const { booth, category } = detail;

    const summary = (
      await generateText({
        system:
          "너는 도서전 부스를 한 문장으로 요약하는 도우미야. 방문객이 '갈지 말지' 30초 안에 판단하도록, 이 부스가 무엇을 보여주는 곳인지 한국어 한 문장(40자 내외)으로만 답해. 과장·홍보문구·이모지·따옴표 없이 담백하게.",
        prompt: [
          `부스명: ${booth.name}`,
          `출판사/브랜드: ${booth.company}`,
          `분야: ${category.name}`,
          `소개: ${booth.longDescription || booth.description}`,
        ].join("\n"),
        temperature: 0.2,
      })
    )
      .trim()
      .replace(/^["'"']|["'"']$/g, "")
      .slice(0, 120);

    if (summary) cache.set(boothId, { summary, at: Date.now() });
    return ok({ summary });
  });
}
