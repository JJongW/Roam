import { getRepository } from "@/lib/repositories";
import { notFound, ok, parseBody, requireAdmin } from "@/lib/api/http";
import { welcomeKitInputSchema } from "@/lib/schemas";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const repo = await getRepository();
  const welcomeKit = await repo.getWelcomeKit(id);
  if (!welcomeKit) return notFound("웰컴키트 정보가 없습니다");
  return ok({ welcomeKit });
}

// 관리자 콘솔 전용 쓰기 — 지금까지 서버측 인가가 아예 없었다(PATCH
// /api/booths/[id]는 requireAdmin을 거치는데 이 라우트만 빠져 있었음).
export async function PUT(req: Request, { params }: Ctx) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await params;
  const parsed = await parseBody(req, welcomeKitInputSchema);
  if (!parsed.ok) return parsed.res;
  const repo = await getRepository();
  const welcomeKit = await repo.upsertWelcomeKit(id, parsed.data);
  return ok({ welcomeKit });
}
