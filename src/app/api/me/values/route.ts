import { z } from "zod";
import { fail, noContent, parseBody } from "@/lib/api/http";
import { getCurrentUser } from "@/lib/api/session";
import { getRepository } from "@/lib/repositories";
import { recordSignal } from "@/lib/memory/service";
import { VALUE_SLUGS } from "@/lib/values";

// 가치 온보딩: 고른 관람 가치를 브레인에 시드(명시 신호). exhibitionSlug 없으면(앱 최초진입
// 온보딩) 첫 전시를 신호 컨텍스트로 쓴다 — 브레인 관심은 가치 slug라 크로스-전시로 산다.
const schema = z.object({
  exhibitionSlug: z.string().min(1).optional(),
  values: z.array(z.string()).min(1).max(8),
});

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return fail("UNAUTHORIZED", "로그인이 필요해요");
  const parsed = await parseBody(req, schema);
  if (!parsed.ok) return parsed.res;

  const values = parsed.data.values.filter((v) => VALUE_SLUGS.includes(v));
  if (values.length === 0) return fail("VALIDATION", "가치를 하나 이상 골라줘");

  const repo = await getRepository();
  let exhibitionId: string | undefined;
  if (parsed.data.exhibitionSlug) {
    const detail = await repo.getExhibition(parsed.data.exhibitionSlug);
    exhibitionId = detail?.exhibition.id;
  } else {
    const { data } = await repo.listExhibitions({ limit: 1 });
    exhibitionId = data[0]?.id;
  }
  if (!exhibitionId) return fail("NOT_FOUND", "전시를 찾을 수 없어요");

  // 고른 가치를 명시 관심 신호로 시드 → 브레인 재증류 → 피드가 즉시 맞춰짐.
  await recordSignal(user.id, {
    kind: "reaction_interested",
    exhibitionId,
    slugs: values,
  });
  return noContent();
}
