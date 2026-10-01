import { z } from "zod";
import { getUserId, notFound, ok, parseBody, requireAdmin } from "@/lib/api/http";
import { getRepository } from "@/lib/repositories";

type Ctx = { params: Promise<{ id: string }> };
const bodySchema = z.object({ decision: z.enum(["approved", "rejected"]) });

/** "같은 브랜드인가요?" 판단. 승인하면 그 부스의 참가사를 대상에 통째로 합친다. */
export async function POST(req: Request, { params }: Ctx) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const parsed = await parseBody(req, bodySchema);
  if (!parsed.ok) return parsed.res;
  const { id } = await params;
  const repo = await getRepository();
  const candidate = await repo.decideExhibitorLinkCandidate(id, parsed.data.decision, await getUserId());
  if (!candidate) return notFound("연결 후보를 찾을 수 없습니다");
  return ok({ candidate });
}
