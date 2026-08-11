import { getRepository } from "@/lib/repositories";
import { created, parseBody, requireAdmin } from "@/lib/api/http";
import { boothInputSchema } from "@/lib/schemas";

// 관리자 콘솔(booth-manager.tsx)만 부른다 — [id]/route.ts의 PATCH·DELETE와 같은
// 이유로 서버측 인가를 건다.
export async function POST(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const parsed = await parseBody(req, boothInputSchema);
  if (!parsed.ok) return parsed.res;
  const repo = await getRepository();
  const booth = await repo.createBooth(parsed.data);
  return created({ booth });
}
