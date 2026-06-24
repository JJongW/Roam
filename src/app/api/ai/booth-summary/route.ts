import { z } from "zod";
import { getRepository } from "@/lib/repositories";
import {
  ok,
  fail,
  notFound,
  parseBody,
  withErrorBoundary,
} from "@/lib/api/http";
import { hasGemini, generateJSON, generateText } from "@/lib/ai/gemini";

const bodySchema = z.object({ boothId: z.string().min(1) });

const extractSchema = z.object({
  summary: z.string(),
  newReleases: z.array(z.string()).max(6).default([]),
  goods: z.array(z.string()).max(6).default([]),
});
type Extract = z.infer<typeof extractSchema>;

/**
 * Per-booth AI extract cache (요약 + 신간 + 굿즈). A booth's facts are fixed for
 * the fair, so the same booth always yields the same extract — re-asking Gemini
 * per page view is waste. Keyed by boothId, reused until stale.
 */
const cache = new Map<string, { data: Extract; at: number }>();
const TTL_MS = 60 * 60 * 1000;

/**
 * One Gemini call pulls a booth's one-line summary + structured 신간(new books)
 * and 굿즈(goods) lists from its blurb. The detail page lazy-loads it (summary
 * above the intro, lists as sections in 소개); falls back to nothing when AI is
 * off or fails (the full intro still covers it).
 */
export async function POST(req: Request) {
  return withErrorBoundary(async () => {
    if (!hasGemini) return fail("INTERNAL", "AI가 설정되지 않았어요");
    const parsed = await parseBody(req, bodySchema);
    if (!parsed.ok) return parsed.res;
    const { boothId } = parsed.data;

    const hit = cache.get(boothId);
    if (hit && Date.now() - hit.at < TTL_MS)
      return ok({ ...hit.data, cached: true });

    const repo = await getRepository();
    const detail = await repo.getBoothDetail(boothId);
    if (!detail) return notFound("부스를 찾을 수 없습니다");
    const { booth, category } = detail;

    try {
      const data = await generateJSON<Extract>({
        system:
          "너는 도서전 부스 정보를 정리하는 도우미야. 부스 소개를 보고 아래 JSON으로만 답해. summary: 무엇을 보여주는 곳인지 한국어 한 문장(40자 내외, 과장·이모지·따옴표 없이). newReleases: 소개에 등장하는 신간/전시 도서·작가명(없으면 빈 배열). goods: 굿즈·기념품 종류(없으면 빈 배열). 추측해서 지어내지 말고, 소개에 근거가 있을 때만 넣어.",
        prompt: [
          `부스명: ${booth.name}`,
          `출판사/브랜드: ${booth.company}`,
          `분야: ${category.name}`,
          `소개: ${booth.longDescription || booth.description}`,
        ].join("\n"),
        schema: extractSchema,
        temperature: 0.2,
      });
      const clean: Extract = {
        summary: data.summary
          .trim()
          .replace(/^["'"']|["'"']$/g, "")
          .slice(0, 120),
        newReleases: (data.newReleases ?? []).filter(Boolean).slice(0, 6),
        goods: (data.goods ?? []).filter(Boolean).slice(0, 6),
      };
      cache.set(boothId, { data: clean, at: Date.now() });
      return ok(clean);
    } catch {
      // Structured extract failed (model/JSON variance) — fall back to a plain
      // one-line summary so the booth still gets its 한 줄 요약 (no 500, no blank).
      try {
        const summary = (
          await generateText({
            system:
              "너는 도서전 부스를 한 문장으로 요약하는 도우미야. 이 부스가 무엇을 보여주는 곳인지 한국어 한 문장(40자 내외)으로만 답해. 과장·이모지·따옴표 없이 담백하게.",
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
        const data: Extract = { summary, newReleases: [], goods: [] };
        if (summary) cache.set(boothId, { data, at: Date.now() });
        return ok(data);
      } catch {
        return ok({ summary: "", newReleases: [], goods: [] });
      }
    }
  });
}
