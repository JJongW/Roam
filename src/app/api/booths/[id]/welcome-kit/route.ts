import { getRepository } from "@/lib/repositories";
import { notFound, ok, parseBody } from "@/lib/api/http";
import { welcomeKitInputSchema } from "@/lib/schemas";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const repo = await getRepository();
  const welcomeKit = await repo.getWelcomeKit(id);
  if (!welcomeKit) return notFound("웰컴키트 정보가 없습니다");
  return ok({ welcomeKit });
}

export async function PUT(req: Request, { params }: Ctx) {
  const { id } = await params;
  const parsed = await parseBody(req, welcomeKitInputSchema);
  if (!parsed.ok) return parsed.res;
  const repo = await getRepository();
  const welcomeKit = await repo.upsertWelcomeKit(id, parsed.data);
  return ok({ welcomeKit });
}
