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

const bodySchema = z.object({ exhibitionSlug: z.string().min(1) });

const summarySchema = z.object({
  summary: z.array(z.string()).default([]),
});

/**
 * Server-side summary cache. The feed barely changes between page loads, so
 * re-summarising on every read wastes Gemini calls. We keep the last summary per
 * exhibition and only regenerate when the content actually changed AND enough
 * has accrued (≥MIN_NEW new posts) OR it's gone stale (≥TTL). Everyone else
 * reads the cached bullets for free. (Per warm instance; a DB-backed cache would
 * make it cross-instance — a later step alongside the community knowledge base.)
 */
type Cached = {
  summary: string[];
  count: number;
  latestTs: number;
  at: number;
};
const cache = new Map<string, Cached>();
const TTL_MS = 10 * 60 * 1000;
const MIN_NEW = 3;

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

    const exId = detail.exhibition.id;
    const page = await repo.listPosts(exId, { limit: 40 });
    const count = page.data.length;
    const latestTs = page.data.reduce(
      (m, p) => Math.max(m, Date.parse(p.createdAt) || 0),
      0,
    );

    // Decide whether to (re)generate, or serve the cached summary for free.
    const prev = cache.get(exId);
    const now = Date.now();
    const changed = !prev || prev.latestTs !== latestTs || prev.count !== count;
    const enoughNew = !prev || count - prev.count >= MIN_NEW;
    const stale = !prev || now - prev.at >= TTL_MS;
    if (prev && !(changed && (enoughNew || stale))) {
      return ok({ summary: prev.summary, count, cached: true });
    }

    if (count === 0) {
      cache.set(exId, { summary: [], count: 0, latestTs: 0, at: now });
      return ok({ summary: [], count: 0 });
    }

    const boothName = new Map(
      (await repo.listBoothsByExhibitionId(exId)).map((b) => [b.id, b.name]),
    );
    const posts = page.data.map((p) => ({
      booth: p.boothId ? (boothName.get(p.boothId) ?? "") : "",
      body: p.body,
    }));

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
    const summary = out.summary.slice(0, 5);
    cache.set(exId, { summary, count, latestTs, at: now });
    return ok({ summary, count });
  });
}
