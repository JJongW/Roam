import { z } from "zod";
import { getRepository } from "@/lib/repositories";
import { ok, fail, notFound, parseBody, withErrorBoundary } from "@/lib/api/http";
import { hasGemini, generateJSON } from "@/lib/ai/gemini";

const bodySchema = z.object({
  exhibitionSlug: z.string().min(1),
  boothIds: z.array(z.string()).min(1).max(40),
  instruction: z.string().trim().min(1).max(200),
});

const planSchema = z.object({
  keepBoothIds: z.array(z.string()).default([]),
  note: z.string().default(""),
});

/**
 * Natural-language route editing: "문학 빼줘", "B홀 근처만". Gemini returns the
 * subset (optionally reordered) of the CURRENT route to keep — it never invents
 * booths, so the result is always a safe filter/reorder of what the visitor had.
 */
export async function POST(req: Request) {
  return withErrorBoundary(async () => {
    if (!hasGemini) return fail("INTERNAL", "AI가 설정되지 않았어요");

    const parsed = await parseBody(req, bodySchema);
    if (!parsed.ok) return parsed.res;
    const { exhibitionSlug, boothIds, instruction } = parsed.data;

    const repo = await getRepository();
    const detail = await repo.getExhibition(exhibitionSlug);
    if (!detail) return notFound("전시를 찾을 수 없습니다");
    const list = await repo.listBoothsByExhibitionId(detail.exhibition.id);
    const byId = new Map(list.map((b) => [b.id, b]));
    const catName = new Map(detail.categories.map((c) => [c.id, c.name]));
    const hallName = new Map(detail.halls.map((h) => [h.id, h.name]));

    const items = boothIds
      .map((id) => byId.get(id))
      .filter((b): b is NonNullable<typeof b> => Boolean(b))
      .map((b) => ({
        id: b.id,
        name: b.name,
        category: catName.get(b.categoryId) ?? "",
        hall: hallName.get(b.hallId) ?? "",
      }));
    if (items.length === 0) return ok({ keepBoothIds: boothIds, note: "" });

    const prompt = [
      "방문객이 현재 관람 동선을 자연어로 수정하려 해. 아래 부스 목록에서",
      "요청에 맞게 남길 부스만 골라 keepBoothIds에 그 id를 순서대로 담아줘.",
      "- 새 부스를 만들어내지 마. 반드시 주어진 id 중에서만 선택.",
      "- '~빼줘/제외'면 해당 부스 제거, '~근처/~홀만'이면 그 조건만 남김,",
      "  '가까운 순/짧게'면 의미 있게 추려도 됨.",
      "- note: 무엇을 바꿨는지 18자 내 한국어 요약.",
      "- 요청이 모호하면 원본을 최대한 보존.",
      "{ keepBoothIds: string[], note: string } JSON만 출력.",
      "",
      `요청: "${instruction}"`,
      `부스: ${JSON.stringify(items)}`,
    ].join("\n");

    const out = await generateJSON({ prompt, schema: planSchema });
    // Safety: only ids that were in the input, de-duped, preserve AI order.
    const allowed = new Set(boothIds);
    const keep = out.keepBoothIds.filter(
      (id, i, a) => allowed.has(id) && a.indexOf(id) === i,
    );
    return ok({
      keepBoothIds: keep.length ? keep : boothIds,
      note: out.note,
      changed: keep.length > 0 && keep.length !== boothIds.length,
    });
  });
}
