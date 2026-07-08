import { z } from "zod";
import { fail, ok, parseBody } from "@/lib/api/http";
import { getCurrentUser } from "@/lib/api/session";
import { getRepository } from "@/lib/repositories";
import { reflectFromSignals } from "@/lib/memory/service";

// 관람 마치기 → 신호 기반 회고를 브레인에 접는다(동선 비의존). 이후 GET /api/me/recap이
// 서술을 lazy 생성. 회고 재료(방문/반응 신호) 없으면 digest=null.
const schema = z.object({ exhibitionSlug: z.string().min(1) });

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return fail("UNAUTHORIZED", "로그인이 필요해요");
  const parsed = await parseBody(req, schema);
  if (!parsed.ok) return parsed.res;

  const repo = await getRepository();
  const detail = await repo.getExhibition(parsed.data.exhibitionSlug);
  if (!detail) return fail("NOT_FOUND", "전시를 찾을 수 없어요");

  const digest = await reflectFromSignals(user.id, detail.exhibition.id);
  return ok({ data: { reflected: digest !== null } });
}
