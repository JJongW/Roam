import { z } from "zod";
import { getRepository } from "@/lib/repositories";
import { ok, fail, notFound, parseBody, withErrorBoundary } from "@/lib/api/http";
import { hasGemini, generateJSON } from "@/lib/ai/gemini";

const bodySchema = z.object({ exhibitionSlug: z.string().min(1) });

const summarySchema = z.object({
  summary: z.array(z.string()).default([]),
});

/**
 * Summarise the community feed into a few bullets — explicitly framed as
 * crowd-sourced visitor reports ("제보"), NOT official data. The UI labels it
 * accordingly so users don't confuse it with organizer-provided info.
 */
export async function POST(req: Request) {
  return withErrorBoundary(async () => {
    if (!hasGemini) return fail("INTERNAL", "AI가 설정되지 않았어요");

    const parsed = await parseBody(req, bodySchema);
    if (!parsed.ok) return parsed.res;

    const repo = await getRepository();
    const detail = await repo.getExhibition(parsed.data.exhibitionSlug);
    if (!detail) return notFound("전시를 찾을 수 없습니다");

    const page = await repo.listPosts(detail.exhibition.id, { limit: 40 });
    const booths = await repo.listBoothsByExhibitionId(detail.exhibition.id);
    const boothName = new Map(booths.map((b) => [b.id, b.name]));

    const posts = page.data.map((p) => ({
      booth: p.boothId ? (boothName.get(p.boothId) ?? "") : "",
      body: p.body,
    }));
    if (posts.length === 0) return ok({ summary: [], count: 0 });

    const prompt = [
      "아래는 전시 방문자들이 남긴 '제보' 글이야(공식 정보 아님, 부정확 가능).",
      "현장 상황 핵심을 3~5개 한국어 불릿으로 요약해줘.",
      "- 각 불릿 30자 이내, 가능하면 부스명 포함.",
      "- 단정 금지: '~라는 제보', '~다는 후기'처럼 전언체로.",
      "- 굿즈/대기/이벤트/꿀팁 등 행동에 도움되는 정보 우선.",
      "{ summary: string[] } JSON만 출력.",
      "",
      JSON.stringify(posts),
    ].join("\n");

    const out = await generateJSON({ prompt, schema: summarySchema });
    return ok({ summary: out.summary.slice(0, 5), count: posts.length });
  });
}
